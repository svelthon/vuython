// The template half. Vue parses every expression it finds with Babel and
// rewrites each free identifier to `_ctx.x`, so Python cannot survive there as
// text — `{{ x if y else z }}` is a syntax error before anything of ours runs.
//
// Each expression is therefore lifted out into a Python function appended to the
// module, and the template keeps only a call to it. What Vue then compiles is
// `_ctx.__expr_0(row)`: a member call on the setup state, which is exactly what
// its own compiler is happiest with.
//
// The same trick Svelthon plays, and it has to be played harder here. Svelte
// copies the text of an expression into the module it generates, so a Python
// expression that happened to parse as JavaScript would have gone through
// untouched; Vue's compiler would have thrown. The lift is not an optimisation
// on either side, but on this one it is the only door.

// From `<` to the `>` that closes the same tag, quotes respected — a Python
// expression in an attribute is full of `<` and `>`.
function tagEnd(source, start) {
    let quote = null;

    for (let i = start + 1; i < source.length; i++) {
        const ch = source[i];

        if (quote) {
            if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
        } else if (ch === '>') {
            return i;
        }
    }

    return -1;
}

// The outermost `<template>` of a single-file component, by name rather than by
// position: an SFC may open with its `<script>`, and a `<template v-if>` inside
// the markup carries the same tag name.
export function overTemplate(content, transform) {
    const open = /<template(\s[^>]*)?>/i.exec(content);
    if (!open) return content;

    const from = open.index + open[0].length;
    const tags = /<template\b|<\/template\s*>/gi;

    tags.lastIndex = from;

    let depth = 0;
    let match;

    while ((match = tags.exec(content))) {
        if (match[0][1] === '/') {
            if (depth === 0) {
                return content.slice(0, from) + transform(content.slice(from, match.index)) +
                    content.slice(match.index);
            }
            depth -= 1;
        } else {
            depth += 1;
        }
    }

    return content;
}

// Elements that never hold children, so never open a scope.
const VOID = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

// A handler Vue would call itself rather than run as a statement: a name, or a
// dotted path. Vue draws the same line with `isMemberExpression`, and draws it
// on the JavaScript it is given; here it is drawn on the Python we are taking
// away, which is the only place the information still exists.
const REFERENCE = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;

const IDENTIFIER = /[A-Za-z_]\w*/g;

// `@click="open := not open"` — an assignment inside an expression, and the
// third of the dialect's bindings.
//
// Vue writes `@click="open = !open"` and every one of its examples does. Python
// has no assignment expression except the walrus, and the walrus is real Python
// with the right meaning here: bind a name from inside an expression. It is
// allowed in a handler and nowhere else, because a handler is the one place a
// template is *doing* something rather than reading.
//
// Two things Python's own grammar refuses are allowed here — an attribute and a
// subscript target — because Vue's `=` takes all three and `v-model` already
// does.
const walk = (text, visit) => {
    let depth = 0;
    let quote = null;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }

        if (c === '"' || c === "'") quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
        else if (depth === 0) visit(i, c);
    }
};

// The `:=` at depth zero, and the commas that separate a group of them.
function splitWalrus(text) {
    const parts = [];
    let cut = 0;

    walk(text, (i, c) => {
        if (c === ',') {
            parts.push(text.slice(cut, i));
            cut = i + 1;
        }
    });

    parts.push(text.slice(cut));
    return parts;
}

function assignment(part) {
    let at = -1;

    walk(part, (i, c) => {
        if (at === -1 && c === ':' && part[i + 1] === '=' && part[i - 1] !== ':') at = i;
    });

    if (at === -1) return null;

    const target = part.slice(0, at).trim();
    const value = part.slice(at + 2).trim();

    if (!value) return null;

    if (/^[A-Za-z_]\w*$/.test(target)) return `__assign('${target}', ${value})`;

    // `row.qty := row.qty + 1`, and `d[k] := v`. Split from the right, so
    // `a.b.c` writes `c` on `a.b`.
    const dotted = target.match(/^([\s\S]+)\.([A-Za-z_]\w*)$/);
    if (dotted) return `__setattr(${dotted[1]}, '${dotted[2]}', ${value})`;

    const keyed = target.match(/^([\s\S]+?)\[([\s\S]+)\]$/);
    if (keyed) return `__setitem(${keyed[1]}, ${keyed[2]}, ${value})`;

    return null;
}

// The whole expression, with every walrus in it rewritten. Returns the text
// untouched when there is none, so a handler that only calls a function costs
// nothing.
export function walrus(expression) {
    if (!expression.includes(':=')) return expression;

    const parts = splitWalrus(expression);
    const rewritten = parts.map((part) => {
        const found = assignment(part);
        return found === null ? part : found;
    });

    // A group returns its last value, as a Python tuple would, so `{{ count }}`
    // beside it still reads afterwards.
    return rewritten.length > 1 ? `(${rewritten.join(', ')})[-1]` : rewritten[0];
}

// `row in rows`, `(row, i) in rows`, `[k, v] of d.items()`. Everything before
// the keyword is Vue's to compile and stays JavaScript; everything after it is
// Python and is lifted.
const FOR = /^\s*([\s\S]+?)\s+(?:in|of)\s+([\s\S]+)$/;

// Names a `v-for` puts in scope for the element and its children. Vue's own
// meaning is kept: the second name is the index over a list and the key over a
// dict, not the second half of a tuple. A Python tuple is a JavaScript array, so
// `v-for="[k, v] in d.items()"` destructures one with no help from us.
const aliases = (text) => [...text.matchAll(IDENTIFIER)].map((m) => m[0]);

// The attribute directives whose value is a Python expression, and what the
// value has to be read as once it is one.
const WRAPPERS = [
    [/^(?:v-if|v-else-if|v-show)$/, '__truthy'],
    [/^(?:v-text|v-html)$/, '__text'],
    [/^(?::|v-bind:|\.)/, '__bound'],
    [/^v-bind$/, '__spread']
];

const wrapperFor = (name) => {
    for (const [pattern, wrapper] of WRAPPERS) if (pattern.test(name)) return wrapper;
    return null;
};

const isHandler = (name) => name.startsWith('@') || name.startsWith('v-on:') || name === 'v-on';

// Attributes inside one tag: the name, then optionally `=` and a quoted or bare
// value. Written out rather than split on whitespace, because a value may hold
// any amount of it.
const ATTRIBUTE = /([^\s"'=<>/]+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

// Every expression in the template, replaced by a call to a function appended to
// the Python. `collect(expression, wrapper, args)` is what makes one and returns
// its name.
export function pythonExpressions(template, collect) {
    const stack = [];
    const scope = () => stack.flatMap((one) => one.names);

    let out = '';
    let cut = 0;
    let i = 0;

    // `passed` is what the call site hands over under a different spelling than
    // the parameter: an event handler declares `event` and receives Vue's
    // `$event`, which Python could not have named.
    const call = (expression, wrapper, extra = [], passed = []) => {
        const args = [...extra, ...scope()];
        const given = [...passed, ...scope()];

        return `${collect(expression.trim(), wrapper, args)}(${given.join(', ')})`;
    };

    while (i < template.length) {
        const ch = template[i];

        // `{{ expression }}`. Vue has no other interpolation form, and no escape
        // for a literal `{{` either, so there is nothing to step over.
        if (ch === '{' && template[i + 1] === '{') {
            const close = template.indexOf('}}', i + 2);

            if (close === -1) break;

            out += template.slice(cut, i) + `{{ ${call(template.slice(i + 2, close), '__text')} }}`;
            i = cut = close + 2;
            continue;
        }

        if (ch !== '<') {
            i += 1;
            continue;
        }

        // A comment carries no expression, and its text may hold anything.
        if (template.startsWith('<!--', i)) {
            const close = template.indexOf('-->', i);
            i = close === -1 ? template.length : close + 3;
            continue;
        }

        if (template[i + 1] === '/') {
            const close = template.indexOf('>', i);

            if (close === -1) break;
            if (stack.length) stack.pop();

            i = close + 1;
            continue;
        }

        const close = tagEnd(template, i);

        if (close === -1) break;

        const name = /^<([A-Za-z][^\s/>]*)/.exec(template.slice(i, close + 1));

        if (!name) {
            i = close + 1;
            continue;
        }

        // The scope this element opens has to exist while its own attributes are
        // rewritten: `v-for="row in rows"` and `:key="row.id"` sit in the same
        // tag, and the second reads the name the first declares.
        const opened = { names: [] };
        stack.push(opened);

        out += template.slice(cut, i) + rewriteTag(template.slice(i, close + 1), call, opened);
        cut = i = close + 1;

        // A self-closing tag or a void element closes the scope at once.
        if (template[close - 1] === '/' || VOID.has(name[1].toLowerCase())) stack.pop();
    }

    return out + template.slice(cut);
}

// Two passes over one tag. The first declares what the element puts in scope,
// the second compiles the expressions — because `:key="row.id"` may be written
// before the `v-for="row in rows"` that declares `row`, and an author who does
// that is writing ordinary Vue.
function rewriteTag(tag, call, opened) {
    const attributes = [...matches(tag)];

    for (const { name, value } of attributes) {
        if (name === 'v-for') {
            const parts = FOR.exec(value);
            if (parts) opened.names.push(...aliases(parts[1]));
        } else if (name === 'v-slot' || name.startsWith('v-slot:') || name.startsWith('#')) {
            opened.names.push(...aliases(value));
        }
    }

    // The tag name: never an attribute.
    const head = /^<[A-Za-z][^\s/>]*/.exec(tag)[0];

    let out = head;
    let cut = head.length;

    for (const { name, value, index, length } of attributes) {
        const replacement = rewriteAttribute(name, value, call, opened);

        if (replacement === null) continue;

        out += tag.slice(cut, index) + `${name}="${replacement}"`;
        cut = index + length;
    }

    return out + tag.slice(cut);
}

function* matches(tag) {
    const head = /^<[A-Za-z][^\s/>]*/.exec(tag)[0];

    ATTRIBUTE.lastIndex = head.length;

    let match;

    while ((match = ATTRIBUTE.exec(tag))) {
        const [whole, name, assigned, doubled, singled, bare] = match;
        const value = doubled ?? singled ?? bare;

        if (assigned === undefined || value === undefined || value.trim() === '') continue;

        yield { name, value, index: match.index, length: whole.length };
    }
}

function rewriteAttribute(name, value, call, opened) {
    if (name === 'v-for') {
        const parts = FOR.exec(value);

        if (!parts) return null;

        // The alias is out of scope while the iterable is compiled:
        // `v-for="row in rows"` iterates the outer `rows`, and a `row` visible
        // there would be this loop's own name, one iteration early.
        const names = opened.names.splice(0, opened.names.length);
        const iterable = call(parts[2], '__seq');

        opened.names.push(...names);

        return `${parts[1]} in ${iterable}`;
    }

    // `v-model="count"` is left exactly as written. Vue compiles it to
    // `_ctx.count = $event`, and `count` is an own property of the object
    // `setup()` returned, so the assignment lands on the accessor and the
    // accessor writes the Python name. Nothing to lift, and nothing to lift it
    // *to*: Vue refuses a v-model whose value is not a member expression, which
    // is what any lifted call would be.
    if (name === 'v-model' || name.startsWith('v-model:')) return null;

    // Declared in the first pass; Vue compiles the value itself.
    if (name === 'v-slot' || name.startsWith('v-slot:') || name.startsWith('#')) return null;

    if (isHandler(name)) {
        // A reference: Vue keeps the value and calls it with the event, so what
        // it must be handed is a JavaScript function. Anything else is an inline
        // statement, and Vue wraps it in `$event => { … }` itself — which is
        // where the event comes from, and why `event` is a parameter.
        //
        // The walrus is read here and only here: a handler is the one place a
        // template does something rather than reads.
        return REFERENCE.test(value.trim())
            ? `__event(${call(value, null)})`
            : call(walrus(value), null, ['event'], ['$event']);
    }

    const wrapper = wrapperFor(name);

    return wrapper === null ? null : call(value, wrapper);
}

// `v-model="value"` where `value` is a prop that travels back up.
//
// Vue refuses a v-model whose value is a declared prop, and it is right to: a
// Vue prop is read-only, and a component writing one would be writing into its
// parent's state behind its back. A Vuython bindable is not read-only — that is
// the whole of what `<=>` says — so the name is aimed at a second accessor,
// declared as nothing, which reads the same value and whose write both keeps it
// and announces it upward.
//
// Only the bindables, and only the name: a v-model on any other name is left
// exactly as the author wrote it, because Vue already does the right thing with
// it.
export function renameModels(markup, names) {
    if (!names.length) return markup;

    const pattern = new RegExp(
        `(\\sv-model(?::[\\w-]+)?(?:\\.[\\w-]+)*\\s*=\\s*")(${names.join('|')})(")`,
        'g'
    );

    return markup.replace(pattern, (_, before, name, after) => `${before}__model_${name}${after}`);
}

// One Python function per template expression, appended to the module.
//
// Deduplicated on the whole shape, so the same expression written twice in one
// component compiles once. `__expr_` is the prefix the generated script looks
// for when it decides what to bind.
export function collector(defs) {
    const seen = new Map();

    return (expression, wrapper, args) => {
        const key = `${wrapper}|${args.join(',')}|${expression}`;
        if (seen.has(key)) return seen.get(key);

        const name = `__expr_${defs.length}`;
        seen.set(key, name);

        defs.push(
            `def ${name}(${args.join(', ')}):\n    return ${wrapper ? `${wrapper}(${expression})` : expression}`
        );

        return name;
    };
}
