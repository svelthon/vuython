'use strict';

// Build-time half of Vuython: run Brython's compiler under Node and split the
// result in two — a plain ES module holding the generated code, and a Vue
// component whose `setup()` hands that code its own namespace back.
//
// CommonJS because brython.js is a classic script that has to execute *after*
// the globals below are in place, which ES imports cannot order (they hoist).

globalThis.self ??= globalThis;           // touched by the bootstrap
globalThis.addEventListener ??= () => {}; // idem
globalThis.__BRYTHON__ ??= {};
globalThis.$B ??= globalThis.__BRYTHON__; // the codegen's eval() resolves $B globally

globalThis.$B.$vuythonGlobalsBefore ??= new Set(Object.getOwnPropertyNames(globalThis));

require('../../vendor/brython.js');

const $B = globalThis.__BRYTHON__;
$B.brython({ ipy_id: [] });

const { INJECTED } = require('./injected.cjs');

// Name the generated module gives to the reactive namespace it receives.
const NS = '__py';

// Brython emits module state into a namespace object:
//     locals_Counter = $B.namespace('Counter')
//     locals_Counter.count = 0
// Nothing lives in a lexical binding, so there is a single call to intercept —
// which the runtime does at execution time. This pattern is only checked, never
// rewritten; if a future codegen stops emitting it, compilation fails loudly
// instead of producing a component with no reactivity at all.
const namespaceCall = (name) => `$B.namespace('${name}')`;

// The module id Brython derives from a filename: only '.' becomes '_'.
const namespaceFor = (filename) => filename.replace(/\./g, '_');

// The prefix the markup pass gives every function it lifts out of the template.
const EXPR_PREFIX = '__expr_';

// A Brython exception carries neither `message` nor `stack`, so a Python syntax
// error would reach Vite as an empty object and be reported as nothing at all.
function pythonError(error, source, lineOffset) {
    if (!error || typeof error !== 'object') return error;

    let described = 'SyntaxError';
    try {
        const name = $B.$getattr($B.get_class(error), '__name__');
        described = `${name}: ${$B.builtins.str.$factory(error)}`;
    } catch {
        /* not a Python exception after all */
    }

    let line;
    try {
        line = $B.$getattr(error, 'lineno', undefined);
    } catch {
        /* no position on it */
    }

    const at = line === undefined ? source : `${source}:${line + lineOffset}`;
    const failure = new SyntaxError(`vuython — ${described} (${at})`);

    failure.loc = line === undefined ? undefined : { line: line + lineOffset, column: 0 };

    return failure;
}

// A source map, so a debugger opens the `.vue` rather than the JavaScript
// Brython generated from it — and a traceback names a line the author wrote.
//
// Brython plants `$B.set_lineno(frame, N)` ahead of every statement it emits, so
// the mapping is read out of the generated code rather than tracked through the
// compiler. One segment per generated line, column zero to column zero: that is
// all a line-oriented language needs, and it is why every pass upstream of this
// one is careful to preserve line numbers — `importjs` blanks its line instead
// of removing it for exactly this reason.
const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(value) {
    let rest = value < 0 ? (-value << 1) | 1 : value << 1;
    let encoded = '';

    do {
        let digit = rest & 31;
        rest >>>= 5;
        if (rest > 0) digit |= 32;
        encoded += VLQ_CHARS[digit];
    } while (rest > 0);

    return encoded;
}

function sourceMap(generated, source, content, lineOffset) {
    const marker = /\$B\.set_lineno\(frame, (\d+)\)/;
    const segments = [];
    let previous = 0;
    let current = null;

    for (const line of generated.split('\n')) {
        const found = line.match(marker);
        if (found) current = Number(found[1]) - 1 + lineOffset;

        if (current === null) {
            segments.push('');
            continue;
        }

        // Everything in a source map is delta-encoded, hence the running
        // `previous`.
        segments.push(vlq(0) + vlq(0) + vlq(current - previous) + vlq(0));
        previous = current;
    }

    return {
        version: 3,
        sources: [source],
        sourcesContent: [content],
        names: [],
        mappings: segments.join(';')
    };
}

// `__all__ = ["ajouter"]` — Python's own way of saying what a module exports,
// and the closest thing it has to JavaScript's `export` keyword. Read from the
// AST, so it stays a plain assignment in the source.
function declaredExports(body) {
    for (const node of body) {
        if (!(node instanceof $B.ast.Assign)) continue;
        if (!node.targets.some((t) => t instanceof $B.ast.Name && t.id === '__all__')) continue;

        const items = node.value?.elts;
        if (!items) continue;

        return items
            .map((item) => (item instanceof $B.ast.Constant ? item.value : null))
            .filter((one) => typeof one === 'string');
    }

    return null;
}

// `__js__ = {"./helpers.js": ["shout"]}` — the JavaScript a plain `.py` needs.
//
// A module has no markup, so it never asks for the three shapes that are
// template concerns: a default export (a child component), a stylesheet imported
// for its effect, a namespace for `<Dialog.Root>`. Only the named form is left,
// which is all a module ever wants — so this can stay real Python, read off the
// AST, where `importjs` had to become a keyword.
function declaredJsImports(body) {
    for (const node of body) {
        if (!(node instanceof $B.ast.Assign)) continue;
        if (!node.targets.some((t) => t instanceof $B.ast.Name && t.id === '__js__')) continue;
        if (!node.value || !node.value.keys) continue;

        const modules = [];

        node.value.keys.forEach((key, index) => {
            const names = (node.value.values[index].elts || [])
                .map((one) => (one instanceof $B.ast.Constant ? one.value : null))
                .filter((one) => typeof one === 'string' && /^[A-Za-z_$][\w$]*$/.test(one));

            if (key instanceof $B.ast.Constant && names.length) {
                modules.push({ from: key.value, names });
            }
        });

        return modules;
    }

    return [];
}

// `doubled => count * 2` — a name bound to an expression that re-runs, which is
// the arrow Svelthon already carries. Nothing about it is Svelte's: it names a
// value computed from other names, and Vue calls that a `computed`.
const ARROW_DERIVED = /^([A-Za-z_]\w*)\s*=>\s*(\S[\s\S]*)$/;

// `=> expr` — the same arrow with nothing to name, which is the effect.
const ARROW_EFFECT = /^=>\s*(\S[\s\S]*)$/;

// `value: str <=>` — a prop that also travels back up. Under Vue that is a prop
// plus an `update:value` event, which is what `v-model:value` binds to.
const BINDABLE = /^([A-Za-z_]\w*\s*:\s*[^=<>]+?)\s*<=>\s*(\S[\s\S]*)?$/;

// `inspect(count, message)` — a console.log that re-runs on its own.
//
// The values have to be *read again* on every change, so they cannot be handed
// over already read. Svelte solves that for itself by compiling `$inspect(x)`
// into `$.inspect(() => [x], …)`, and the same trick works here one level down:
// the arguments go into a lambda, and calling it re-reads them through the
// namespace accessors, which is what makes the effect follow them.
//
// `inspect_with(fn, *values)` is their `$inspect(…).with(fn)`, which Python
// cannot spell — `with` is a keyword. Taking the callable first needs no parsing
// at all, and it is what Python does whenever position stops being enough.
const INSPECT = /^inspect(_with)?\s*\((\s*\S[\s\S]*)\)\s*$/;

const ARROW_INDENTED = /^[ \t]+(?:[A-Za-z_]\w*\s*)?=>\s/;

// `importjs` — a component's JavaScript imports, written where its Python is.
//
// A keyword rather than a declaration read from the AST. `__all__` is real
// Python and the compiler only reads it; a dict literal wearing the same costume
// invites being computed — which parses, raises nothing, and does not work. A
// keyword makes that unwriteable instead of merely wrong.
//
// The clause is JavaScript's own, since the keyword has already announced that
// much. There is nothing new to learn, and no ambiguity to invent between a
// default import and a named one.
//
// It matters more here than it does under Svelte. Svelte resolves `<Notes />` to
// whatever lexical binding it finds; Vue calls `resolveComponent("Notes")`,
// which reads the `components` option. So a default or namespace import is not
// only a value Python can name — it is a **component registration**, and without
// one a Vuython component could not name another at all.
const IMPORTJS = /^importjs\b/;
const IMPORTJS_ANYWHERE = /^[ \t]+importjs\b/;
const IMPORTJS_CLAUSE = /^importjs\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*$/;
const IMPORTJS_EFFECT = /^importjs\s+(['"])([^'"]+)\1\s*$/;
const JS_NAME = /^[A-Za-z_$][\w$]*$/;

function importJsClause(line, where) {
    const bare = line.match(IMPORTJS_EFFECT);
    if (bare) return { from: bare[2], kind: 'effect', entries: [] };

    const found = line.match(IMPORTJS_CLAUSE);
    if (!found) {
        throw new SyntaxError(
            `vuython — importjs expects \`importjs <clause> from "module"\` or ` +
                `\`importjs "module"\`, on one line (${where})`
        );
    }

    const clause = found[1].trim();
    const from = found[3];

    const star = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (star) return { from, kind: 'namespace', entries: [{ name: null, local: star[1] }] };

    // `{a, b as c}` — the names between the braces, each optionally renamed.
    const namedEntries = (inner) => {
        const entries = inner
            .split(',')
            .map((one) => one.trim())
            .filter(Boolean)
            .map((one) => {
                const renamed = one.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
                if (renamed) return { name: renamed[1], local: renamed[2] };
                if (JS_NAME.test(one)) return { name: one, local: one };

                throw new SyntaxError(`vuython — importjs: \`${one}\` is not a name (${where})`);
            });

        if (!entries.length) throw new SyntaxError(`vuython — importjs: empty {} (${where})`);
        return entries;
    };

    const braced = clause.match(/^\{([\s\S]*)\}$/);
    if (braced) return { from, kind: 'named', entries: namedEntries(braced[1]) };

    // `Player, {stopAll}` — the default and some names, from the same module.
    // The default comes first in `entries`, marked by a null `name`.
    const mixed = clause.match(/^([A-Za-z_$][\w$]*)\s*,\s*\{([\s\S]*)\}$/);
    if (mixed) {
        return {
            from,
            kind: 'mixed',
            entries: [{ name: null, local: mixed[1] }, ...namedEntries(mixed[2])]
        };
    }

    if (JS_NAME.test(clause)) {
        return { from, kind: 'default', entries: [{ name: null, local: clause }] };
    }

    throw new SyntaxError(`vuython — importjs: \`${clause}\` is not an import clause (${where})`);
}

// Lift every `importjs` out of the source, leaving the line blank behind it.
//
// Blank rather than removed: a line-preserving pass costs the tracebacks and
// `$B.set_lineno` exactly nothing.
function takeImportJs(src, where, lineOffset) {
    const lines = src.split('\n');
    const imports = [];
    const kept = [];
    let quote = null;

    for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        const at = `${where}:${n + 1 + lineOffset}`;

        if (quote === null && IMPORTJS_ANYWHERE.test(line)) {
            // A JavaScript import is hoisted and static; there is no such thing
            // as one inside a branch, and silently hoisting it would be a lie.
            throw new SyntaxError(`vuython — importjs must start the line, at the top level (${at})`);
        }

        if (quote === null && IMPORTJS.test(line)) {
            imports.push(importJsClause(line.trim(), at));
            kept.push('');
            continue;
        }

        kept.push(line);
        quote = endQuote(line, quote);
    }

    return { source: kept.join('\n'), imports };
}

// One import statement, in whichever of the five shapes it was declared.
function jsImportLine(one) {
    const from = JSON.stringify(one.from);
    const list = (entries) =>
        entries.map((e) => (e.name === e.local ? e.local : `${e.name} as ${e.local}`)).join(', ');

    if (one.kind === 'effect') return `import ${from};`;
    if (one.kind === 'namespace') return `import * as ${one.entries[0].local} from ${from};`;
    if (one.kind === 'default') return `import ${one.entries[0].local} from ${from};`;

    if (one.kind === 'mixed') {
        const [first, ...rest] = one.entries;
        return `import ${first.local}, { ${list(rest)} } from ${from};`;
    }

    return `import { ${list(one.entries)} } from ${from};`;
}

// What a template may name as a tag. A default import is how a child component
// arrives — 25 of the 65 imports measured across the Svelthon projects — and a
// namespace is what `<Dialog.Root>` needs. A named import is a value, and
// registering it would only offer the template a tag that is not a component.
const registrable = (one) =>
    one.kind === 'default' || one.kind === 'namespace' || one.kind === 'mixed'
        ? [one.entries[0].local]
        : [];

// Brackets closed on the line, ignoring those inside a string.
function balanced(expr) {
    let depth = 0;
    let quote = null;

    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];

        if (quote) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }

        if (c === '"' || c === "'") quote = c;
        else if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
    }

    return depth === 0;
}

// Whether a line ends inside a triple-quoted string, so the arrows are not read
// out of a docstring.
function endQuote(line, quote) {
    for (let i = 0; i < line.length; i++) {
        if (quote) {
            if (line.startsWith(quote, i)) {
                i += quote.length - 1;
                quote = null;
            }
            continue;
        }

        if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
            quote = line.slice(i, i + 3);
            i += 2;
        } else if (line[i] === '#') {
            return quote;
        }
    }

    return quote;
}

// The dialect, lifted before py2js: none of it is Python, and Brython would
// rightly refuse it.
function takeArrows(src, where, lineOffset) {
    const lines = src.split('\n');
    const out = [];
    let quote = null;
    let anonymous = 0;

    for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        const at = `${where}:${n + 1 + lineOffset}`;
        const kind = (named) => (named ? 'derived' : 'effect');

        if (quote === null && ARROW_INDENTED.test(line)) {
            throw new SyntaxError(
                `vuython — a derived and an effect both belong at the top level of ` +
                    `the module, and \`=>\` is only read there (${at})`
            );
        }

        const found = quote === null ? line.match(ARROW_DERIVED) || line.match(ARROW_EFFECT) : null;

        // A named match carries the name in group 1 and the expression in 2; an
        // anonymous one has the expression in 1, and its name is generated.
        const named = found && found.length > 2;
        const expression = found && (named ? found[2] : found[1]);

        // The expression has to finish on its line. A `{` or a `(` left open
        // would swallow the lines under it into a lambda, and Brython would
        // report a mismatched bracket several lines further down.
        if (found && !balanced(expression)) {
            throw new SyntaxError(
                `vuython — a ${kind(named)} written with \`=>\` must fit on one line; ` +
                    `use @${kind(named)} on a def for anything longer (${at})`
            );
        }

        const watched = quote === null && !found ? line.match(INSPECT) : null;
        const both = quote === null && !found && !watched ? line.match(BINDABLE) : null;

        if (!found && !watched && !both) out.push(line);
        else if (watched)
            out.push(`__inspect_${anonymous++} = inspect${watched[1] || ''}(lambda: [${watched[2]}])`);
        else if (both) out.push(`${both[1]} = bindable(${both[2] || ''})`);
        else if (named) out.push(`${found[1]} = derived(lambda: ${expression})`);
        else out.push(`__effect_${anonymous++} = effect(lambda: ${expression})`);

        quote = endQuote(line, quote);
    }

    return out.join('\n');
}

const isCallTo = (node, name) =>
    node.value instanceof $B.ast.Call &&
    node.value.func instanceof $B.ast.Name &&
    node.value.func.id === name;

const hasDecorator = (node, name) =>
    (node.decorator_list || []).some((d) => d instanceof $B.ast.Name && d.id === name);

// `@effect.pre` — a dotted decorator, which is a different AST node: an
// `Attribute` over a `Name`, not a `Name`.
const hasDottedDecorator = (node, name, attribute) =>
    (node.decorator_list || []).some(
        (d) =>
            d instanceof $B.ast.Attribute &&
            d.attr === attribute &&
            d.value instanceof $B.ast.Name &&
            d.value.id === name
    );

// Where a statement keeps the statements it holds.
const BODIES = ['body', 'orelse', 'finalbody', 'handlers', 'cases', 'items'];

const JS_RESERVED = new Set(`break case catch class const continue debugger default delete do else
export extends finally for function if import in instanceof new return super switch this throw try
typeof var void while with yield enum implements interface package private protected public static
null true false await let`.split(/\s+/));

// The surface of a module: every name declared at its top level, sorted by what
// the emission has to build for it.
//
// A block is not a scope in Python — a name bound inside `if`, `for`, `try`,
// `with` or `match` belongs to the module exactly as one written at the left
// margin does. `def` and `class` are the real scopes, and neither is descended
// into.
function surface(body) {
    const props = [];
    const bindables = [];
    const state = [];
    const funcs = [];
    const deriveds = [];
    const effects = [];
    const inspects = [];
    const seen = new Set();
    // Names the author wrote and the compiler cannot emit: a JavaScript reserved
    // word makes an invalid `const export = …`. They are dropped, but they were
    // still *declared*, and the locked-name check has to see them — otherwise
    // redefining `export` would be the one silent case left.
    const reserved = [];

    const take = (name) => {
        if (seen.has(name)) return false;
        if (JS_RESERVED.has(name)) {
            reserved.push(name);
            return false;
        }
        seen.add(name);
        return true;
    };

    const visit = (statements) => {
        for (const node of statements) {
            if (node instanceof $B.ast.Assign) {
                for (const target of node.targets) {
                    if (!(target instanceof $B.ast.Name) || !take(target.id)) continue;

                    // `x => expr` arrives here as `x = derived(lambda: expr)`,
                    // and `=> expr` as `__effect_0 = effect(lambda: expr)`. A
                    // lambda answers a call exactly as a `def` does, so the
                    // emission needs no special case for either.
                    if (isCallTo(node, 'derived')) deriveds.push({ name: target.id });
                    else if (isCallTo(node, 'effect')) effects.push({ name: target.id });
                    else if (isCallTo(node, 'inspect')) inspects.push({ name: target.id });
                    // The callable comes first, so the emission takes it off the
                    // front of the evaluated list rather than out of the source.
                    else if (isCallTo(node, 'inspect_with'))
                        inspects.push({ name: target.id, logger: true });
                    // `focus = export(lambda: field.focus())`, the call form of
                    // `@export`. The arity comes off the lambda, since unlike a
                    // derived or an effect an exposed function takes arguments.
                    else if (isCallTo(node, 'export'))
                        funcs.push({
                            name: target.id,
                            arity: (node.value.args?.[0]?.args?.args || []).length,
                            exposed: true
                        });
                    else state.push(target.id);
                }
            } else if (node instanceof $B.ast.AnnAssign) {
                // An annotation is a declaration of interface, like a dataclass
                // field: `name: str` is a prop, `count: int = 0` a prop with a
                // default. A bare assignment stays internal state.
                if (node.target instanceof $B.ast.Name && take(node.target.id)) {
                    (isCallTo(node, 'bindable') ? bindables : props).push(node.target.id);
                }
            } else if (
                node instanceof $B.ast.FunctionDef ||
                node instanceof $B.ast.AsyncFunctionDef
            ) {
                if (!take(node.name)) continue;

                const pre = hasDottedDecorator(node, 'effect', 'pre');
                const root = hasDottedDecorator(node, 'effect', 'root');
                const entry = {
                    name: node.name,
                    arity: ((node.args && node.args.args) || []).length,
                    ...(pre ? { pre: true } : {}),
                    ...(root ? { root: true } : {}),
                    // A directive is an ordinary function that is *also*
                    // reachable from the template under a `v-` name.
                    ...(hasDecorator(node, 'directive') ? { directive: true } : {}),
                    // `@export` leaves the function where it was: it is an
                    // ordinary function that is *also* reachable from a parent
                    // holding a ref to the instance.
                    ...(hasDecorator(node, 'export') ? { exposed: true } : {})
                };
                const bucket = hasDecorator(node, 'derived')
                    ? deriveds
                    : hasDecorator(node, 'effect') || pre || root
                      ? effects
                      : funcs;

                bucket.push(entry);
            } else if (!(node instanceof $B.ast.ClassDef)) {
                for (const key of BODIES) if (node[key]) visit(node[key]);
            }
        }
    };

    visit(body);

    return { props, bindables, state, funcs, deriveds, effects, inspects, reserved };
}

const injectable = (one, declared, component) =>
    (component || !one.component) && !declared.includes(one.name);

const injections = (declared, component) =>
    INJECTED.filter((one) => injectable(one, declared, component)).map(
        (one) => `bind(${NS}, '${one.name}', ${one.value}, () => {});`
    );

// A locked name is Vuython's own word, not a builtin to shadow: refused rather
// than quietly given to either side. Scoped like the injection itself, so a
// component-only word is free in a plain `.py`.
function refuseLocked(declared, component, source) {
    const taken = INJECTED.find(
        (one) => one.locked && (component || !one.component) && declared.includes(one.name)
    );

    if (!taken) return;

    throw new SyntaxError(
        `vuython — \`${taken.name}\` is one of Vuython's own words and cannot be ` +
            `redefined (${source})`
    );
}

// The modules a `from x import y` names. Brython's own bookkeeping —
// `root.imports` — records `import x` and nothing else, so `from panier import
// ajouter` would be invisible to the prelude that resolves a sibling `.py`, and
// the component would compile cleanly then fail in the browser on a module it
// had never been given.
//
// Asked of the text rather than the AST: the walk is the precise answer, but it
// leans on Brython's AST classes, and a build reaching the browser through a
// bundler ends up with a second set of them where the walk quietly matches
// nothing. The cost of asking this way is a name listed that was already going
// to be.
const FROM_IMPORT = /^[ \t]*from\s+([A-Za-z_][\w.]*)\s+import\s/gm;

function fromImportsInSource(src) {
    const names = [];
    let found;

    FROM_IMPORT.lastIndex = 0;
    while ((found = FROM_IMPORT.exec(src))) names.push(found[1].split('.')[0]);

    return names;
}

// `src/panier.py` → `panier`, the name Python imports it by.
//
// One kind of file, where Svelthon needs two. Svelte's `panier.svelte.ts` has to
// be *named* so the compiler knows to transform the runes inside it, and
// Svelthon mirrors that with `panier.svelte.py`. Vue's reactivity is a runtime
// library — `shallowRef` is a function call, not a compiled form — so a module
// holding reactive state needs no marker in its name, and there is no second
// spelling for an author to learn or for us to explain.
const pythonModuleName = (source) => source.split('/').pop().replace(/\.py$/, '');

const VIRTUAL_PREFIX = 'virtual:vuython/';
const virtualId = (name) => VIRTUAL_PREFIX + name;

function compile(
    src,
    name = 'Component',
    source = name,
    { defs = [], lineOffset = 0, title = name, module: asModule = false, sourceContent = null } = {}
) {
    // A `<script>` body sits inside markup and every Vue example indents it one
    // level; in JavaScript that is whitespace, in Python it is syntax. Brython's
    // own `unindent` is what it already runs on every `<script type="text/
    // python">`, so the two tags behave alike.
    //
    // A `.py` gets neither half: a file is not an embedded block, so an indented
    // one is a mistake rather than a convenience, and a module has no template
    // to collect from.
    //
    // The dedent has to happen **before** the template defs are appended: those
    // are generated at column zero and would trip its conservative bail — one
    // non-blank line already at column zero and the source comes back untouched.
    const body = asModule ? src : $B.unindent(src);

    src = defs.length ? `${body}\n${defs.join('\n\n')}\n` : body;

    // Both lifted before py2js: neither is Python, and Brython would rightly
    // refuse them.
    const lifted = takeImportJs(src, source, lineOffset);

    src = takeArrows(lifted.source, source, lineOffset);

    // Brython reads the source back out of this cache to quote the offending
    // line, and `compiler_error` does it without checking: an unregistered
    // filename turns every compile error into `Cannot read properties of
    // undefined`. That covers `return` outside a function, `break` outside a
    // loop: the mistakes a beginner actually makes.
    $B.file_cache[source] = src;

    let root;
    try {
        root = $B.py2js({ src, filename: source }, name, [name]);
    } catch (error) {
        throw pythonError(error, source, lineOffset);
    }

    let { props, bindables, state, funcs, deriveds, effects, inspects, reserved } =
        surface(root._ast.body);
    const js = root.to_js();
    const namespace = namespaceFor(source);

    // A module has no parent, so an annotation there declares plain state, and a
    // prop would be meaningless.
    if (asModule) {
        state = [...props, ...bindables, ...state];
        props = [];
        bindables = [];

        // `watchEffect` outside a component belongs to no scope, so nothing ever
        // stops it. That is exactly what `effectScope` is for, which is why
        // `@effect.root` is the form a module writes. Anything else here would
        // be a function that looks reactive and leaks, so it is refused rather
        // than quietly promoted.
        const orphan = effects.find((e) => !e.root);

        if (orphan) {
            throw new SyntaxError(
                `vuython — \`@effect\` belongs to a component, which is what stops it; ` +
                    `a .py module writes an effect with \`@effect.root\`, whose name ` +
                    `receives the stopper (${source})`
            );
        }
    }

    if (!js.includes(namespaceCall(namespace))) {
        throw new Error(
            `vuython: the code generated for ${source} never calls ${namespaceCall(namespace)} — ` +
                `Brython's codegen no longer exposes the module namespace where Vuython hooks it`
        );
    }

    const declared = [
        ...props, ...bindables, ...state,
        ...funcs.map((f) => f.name),
        ...deriveds.map((d) => d.name),
        ...effects.map((e) => e.name),
        ...inspects.map((i) => i.name)
    ];

    refuseLocked([...declared, ...reserved], !asModule, source);

    const module = [
        `import { withNamespace, pyError } from 'vuython/runtime';`,
        ``,
        `export function init(${NS}) {`,
        `  try {`,
        `    return withNamespace('${namespace}', ${NS}, () => {`,
        js,
        `    });`,
        `  } catch (err) { throw pyError(err, ${JSON.stringify(source)}, ${lineOffset}); }`,
        `}`
    ].join('\n');

    // The two declarations meet here, in one shape: `__js__` is the module's and
    // only ever names, `importjs` is the component's and covers all five forms.
    const surfaced = {
        props, bindables, state, funcs, deriveds, effects, inspects, declared, title,
        jsImports: [
            ...declaredJsImports(root._ast.body).map((one) => ({
                from: one.from,
                kind: 'named',
                entries: one.names.map((n) => ({ name: n, local: n }))
            })),
            ...lifted.imports
        ],
        declaredNames: declaredExports(root._ast.body)
    };

    // Everything a `import panier` in this file will need evaluated before
    // init() runs, so the namespace is registered by the time Brython looks it
    // up. Both spellings are asked, since neither says which it is.
    const imports = [
        ...new Set([...Object.keys(root.imports), ...fromImportsInSource(src)])
    ];

    const map = sourceMap(js, source, sourceContent ?? src, lineOffset);

    return {
        script: asModule
            ? moduleScript(name, source, namespace, lineOffset, surfaced)
            : componentScript(name, source, namespace, lineOffset, surfaced),
        module,
        map,
        bindables,
        imports
    };
}

// A shared module: an ordinary `.py`, whose names become refs at module scope
// and are therefore created once for the whole application rather than once per
// component instance.
//
// **One kind of file, where Svelthon needs two.** Svelte compiles its runes, so a
// module holding them has to be *named* `panier.svelte.ts` for the compiler to
// know; Svelthon mirrors that with `panier.svelte.py` beside a plain `panier.py`,
// and the difference has to be taught. Vue's reactivity is a runtime library:
// `shallowRef` is a function call. There is nothing for a compiler to be told,
// so there is no second spelling.
function moduleScript(name, source, namespace, lineOffset, surfaced) {
    const { state, funcs, deriveds, effects, declared, jsImports, declaredNames } = surfaced;

    const ref = (n) => `__ref_${n}`;
    const fn = (n) => `__fn_${n}`;
    const memo = (n) => `__memo_${n}`;
    const scope = (n) => `__scope_${n}`;
    const bump = (n) => `__bump_${n}`;
    const read = (n) => `__read_${n}`;
    const jsBound = (n) => `__js_${n}`;

    const jsLocals = [
        ...new Set(jsImports.flatMap((one) => one.entries.map((e) => e.local)))
    ].filter((n) => !declared.includes(n));

    const imported = ['shallowRef', 'computed', 'triggerRef']
        .concat(effects.length ? ['watchEffect', 'effectScope'] : []);

    // Functions and deriveds — the two a caller *calls*. A module that wants to
    // narrow the list says so with `__all__`, exactly as it would to a Python
    // caller.
    const callable = [...funcs.map((f) => f.name), ...deriveds.map((d) => d.name)];
    const exported = (declaredNames ?? callable).filter(
        (n) => /^[A-Za-z_$][\w$]*$/.test(n) && !JS_RESERVED.has(n)
    );

    // A name in `__all__` that is neither is refused rather than dropped. An ES
    // module has no live named export, so a piece of state exported by value
    // would be a snapshot that never moves again — silently, which is the one
    // behaviour worth refusing outright. `state` is the live view, and the
    // message says so.
    const wrong = exported.find((n) => !callable.includes(n));

    if (wrong) {
        throw new SyntaxError(
            `vuython — \`__all__\` names \`${wrong}\`, which is not a function; ` +
                `a JavaScript caller reads state through the module's \`state\` export, ` +
                `which stays live (${source})`
        );
    }

    return [
        `import { init } from ${JSON.stringify(virtualId(name))};`,
        `import { ${imported.join(', ')} } from 'vue';`,
        `import { bind, hide, track, follow, pyError, pyEvent, pyBoundary, plainData, pyData,` +
            ` jsCall, registerModule, NONE } from 'vuython/runtime';`,
        ...jsImports.map(jsImportLine),
        ``,
        ...state.flatMap((n) => [
            `const ${ref(n)} = shallowRef(undefined);`,
            `const ${bump(n)} = () => triggerRef(${ref(n)});`,
            `const ${read(n)} = () => { ${ref(n)}.value; };`
        ]),
        ...funcs.map((f) => `const ${fn(f.name)} = shallowRef(undefined);`),
        ...deriveds.flatMap((d) => [
            `const ${fn(d.name)} = shallowRef(undefined);`,
            `const ${memo(d.name)} = computed(() => ${fn(d.name)}.value());`
        ]),
        ...effects.flatMap((e) => [
            `const ${fn(e.name)} = shallowRef(undefined);`,
            `let ${scope(e.name)};`
        ]),
        ``,
        `const ${NS} = {};`,
        `Object.defineProperty(${NS}, '$vuython', { value: true });`,
        `${NS}.$proxy = true;`,
        `${NS}.__name__ = '${namespace}';`,
        ``,
        ...state.map(
            (n) =>
                `bind(${NS}, '${n}', () => ${ref(n)}.value,` +
                ` (v) => { ${ref(n)}.value = track(v, ${bump(n)}, ${read(n)}); });`
        ),
        // A module's function is read from *another* module, where the namespace
        // is an ordinary JavaScript object and Brython converts what it is
        // given. `pyBoundary` undoes that conversion, so the callee sees the
        // Python it was written for.
        ...funcs.map(
            (f) => `bind(${NS}, '${f.name}', () => pyBoundary(${fn(f.name)}.value), (v) => { ${fn(f.name)}.value = v; });`
        ),
        ...deriveds.map(
            (d) => `bind(${NS}, '${d.name}', () => follow(${memo(d.name)}.value), (v) => { ${fn(d.name)}.value = v; });`
        ),
        ...effects.map(
            (e) => `bind(${NS}, '${e.name}', () => () => ${scope(e.name)} && ${scope(e.name)}.stop(), (v) => { ${fn(e.name)}.value = v; });`
        ),
        ...injections(declared, false),
        ...jsLocals.map((n) => `const ${jsBound(n)} = jsCall(${n});`),
        ...jsLocals.map((n) => `bind(${NS}, '${n}', () => ${jsBound(n)}, () => {});`),
        ``,
        // Published under its Python name *before* the body runs, so a module
        // that imports another during its own evaluation finds it.
        `registerModule(${JSON.stringify(pythonModuleName(source))}, ${NS});`,
        `init(${NS});`,
        `hide(${NS}, ${JSON.stringify(declared.filter((n) => !n.startsWith('_')))});`,
        ``,
        ...effects.flatMap((e) => [
            `${scope(e.name)} = effectScope();`,
            `${scope(e.name)}.run(() => watchEffect((__cleanup) => { const __d = ${fn(e.name)}.value();` +
                ` if (typeof __d === 'function') __cleanup(pyEvent(__d, ${lineOffset})); }, { flush: 'post' }));`
        ]),
        ``,
        // The namespace itself, so JavaScript reads the same accessors Python
        // writes — a live view, not a snapshot.
        `export const state = ${NS};`,
        ...exported.map(
            (n) =>
                `export const ${n} = (...a) => { const f = pyEvent(${fn(n)}.value, ${lineOffset});` +
                ` return plainData(f(...a)); };`
        ),
        `export default ${NS};`
    ].join('\n');
}

// The component Vue is handed.
//
// One `shallowRef` per module-level name, and one accessor per name on a single
// object — which `setup()` then returns *as is*. That object is the namespace
// Brython writes into and the setup state Vue reads from, at the same time and
// without a copy: Svelte needed a component-local `const` beside every accessor,
// because its template reads lexical bindings its compiler placed itself.
function componentScript(name, source, namespace, lineOffset, surfaced) {
    const { props, bindables, state, funcs, deriveds, effects, inspects, declared, title,
        jsImports } = surfaced;

    // An imported JavaScript name, once it has been given a Python-aware
    // boundary. Wrapped once and not on every read, because Python compares a
    // function by identity: reading `helpers.click` twice has to answer the same
    // object.
    const jsBound = (n) => `__js_${n}`;
    const jsLocals = [
        ...new Set(jsImports.flatMap((one) => one.entries.map((e) => e.local)))
    ].filter((n) => !declared.includes(n));
    const components = [...new Set(jsImports.flatMap(registrable))];

    const ref = (n) => `__ref_${n}`;
    const fn = (n) => `__fn_${n}`;
    const local = (n) => `__local_${n}`;
    const memo = (n) => `__memo_${n}`;
    const scope = (n) => `__scope_${n}`;
    const bump = (n) => `__bump_${n}`;
    const read = (n) => `__read_${n}`;

    // A template's expressions are not the author's functions: they were lifted
    // out of the markup, and each one is read back through `template()`, which
    // is what makes `pep.title` find a key on a dict for the length of one
    // evaluation and nowhere else.
    const lifted = funcs.filter((f) => f.name.startsWith(EXPR_PREFIX));
    const written = funcs.filter((f) => !f.name.startsWith(EXPR_PREFIX));

    const lifecycle = (hook) => written.some((f) => f.name === hook);
    const where = (n) => JSON.stringify(`${n}() — ${source}`);

    // A watched name: the ref that holds it, plus the two halves of the marker
    // an in-place mutation fires. Under Vue both halves are that same ref —
    // `triggerRef(r)` wakes exactly the readers `r.value` subscribed.
    const watched = (n) => [
        `const ${ref(n)} = shallowRef(undefined);`,
        `const ${bump(n)} = () => triggerRef(${ref(n)});`,
        `const ${read(n)} = () => { ${ref(n)}.value; };`
    ];

    const imported = ['shallowRef', 'computed', 'triggerRef', 'watchEffect']
        .concat(effects.some((e) => e.root) ? ['effectScope'] : [])
        .concat(lifecycle('on_mount') ? ['onMounted'] : [])
        .concat(lifecycle('on_destroy') ? ['onUnmounted'] : [])
        .concat(injectable({ name: 'provide', component: true }, declared, true) ? ['provide as __provide'] : [])
        .concat(injectable({ name: 'inject', component: true }, declared, true) ? ['inject as __inject'] : [])
        .concat(injectable({ name: 'props_id', component: true }, declared, true) ? ['useId as __useId'] : []);

    // What `@export` marks: an ordinary function that is *also* reachable from a
    // parent holding a ref to this instance. Vue calls that `expose`, and it is
    // the only way out of a component that is not a prop or an event.
    const exposed = written.filter((f) => f.exposed);

    // And what `@directive` marks. The object is static — Vue reads it off the
    // component, not off an instance — so it carries the *name* and looks the
    // function up through `binding.instance` when a hook fires.
    const directives = written.filter((f) => f.directive);

    return [
        `import { init } from ${JSON.stringify(virtualId(name))};`,
        `import { ${imported.join(', ')} } from 'vue';`,
        `import { bind, hide, track, follow, template, pyError, pyEvent, plainData, pyData,` +
            ` jsCall, writeAttr, writeItem, ticking, pyDirective, __pybridge, NONE } from 'vuython/runtime';`,
        ...jsImports.map(jsImportLine),
        ``,
        `export default {`,
        `  name: ${JSON.stringify(title)},`,
        // Vue resolves `<Notes />` through `resolveComponent`, which reads this
        // option — where Svelte resolves a capitalised tag to whatever lexical
        // binding it can see. So an imported child has to be registered, and
        // this is the line that lets a Vuython component name another one.
        ...(components.length ? [`  components: { ${components.join(', ')} },`] : []),
        ...(directives.length
            ? [
                  `  directives: { ${directives
                      .map((d) => `${d.name}: pyDirective('${d.name}', ${lineOffset})`)
                      .join(', ')} },`
              ]
            : []),
        // Declared, not inferred: Vue routes an attribute to `attrs` unless a
        // prop of that name exists, and an annotation is exactly the author
        // saying one does.
        ...(props.length || bindables.length
            ? [`  props: {${[...props, ...bindables].map((n) => ` ${n}: { default: undefined }`).join(',')} },`]
            : []),
        ...(bindables.length
            ? [`  emits: [${bindables.map((b) => JSON.stringify(`update:${b}`)).join(', ')}],`]
            : []),
        `  setup(__props, __ctx) {`,

        // Every name gets its cell before any Python runs: the module body may
        // assign them in any order, and a `def` may close over one declared
        // below it.
        ...props.map((n) => `    const ${local(n)} = shallowRef(undefined);`),
        ...bindables.flatMap((b) => [`    const ${local(b)} = shallowRef(undefined);`, ...watched(b).map((l) => `    ${l}`)]),
        ...state.flatMap((n) => watched(n).map((l) => `    ${l}`)),
        ...funcs.map((f) => `    const ${fn(f.name)} = shallowRef(undefined);`),
        ...deriveds.flatMap((d) => [
            `    const ${fn(d.name)} = shallowRef(undefined);`,
            `    const ${memo(d.name)} = computed(() => ${fn(d.name)}.value());`
        ]),
        ...effects.flatMap((e) =>
            e.root
                ? [`    const ${fn(e.name)} = shallowRef(undefined);`, `    let ${scope(e.name)};`]
                : [`    const ${fn(e.name)} = shallowRef(undefined);`]
        ),
        ...inspects.map((i) => `    const ${fn(i.name)} = shallowRef(undefined);`),
        ``,
        // The parent's value when it sent one, the annotation's default
        // otherwise — the default being whatever the Python body assigned during
        // init(). Reading `__props` is what registers the dependency, so a
        // parent update flows into Python's namespace on the next read.
        `    const ${NS} = {};`,
        // Rebinding a global makes Brython delete the name from its namespace
        // first, which would take the accessor with it. The runtime skips that
        // delete for objects carrying this flag, and nothing else carries it.
        `    Object.defineProperty(${NS}, '$vuython', { value: true });`,
        // Reading a global goes through $B.resolve_global → resolve_in_namespace,
        // which treats an undefined property as an unbound name rather than as a
        // missing one — which is what keeps NameError working while every
        // declared name is already an own property.
        `    ${NS}.$proxy = true;`,
        // `from x import y` reads the importing module's own name to work out
        // what package it sits in. Ours had none, so the lookup asked for a
        // module called `undefined`.
        `    ${NS}.__name__ = '${namespace}';`,
        ``,
        ...props.map(
            (n) =>
                `    bind(${NS}, '${n}', () => follow((__props.${n} !== undefined ? __props.${n} : ${local(n)}.value) ?? NONE),` +
                ` (v) => { ${local(n)}.value = v; });`
        ),
        // A bindable is a prop plus an event, which is all `v-model:x` ever was.
        // The write is announced upward *and* kept locally, so a component whose
        // parent bound nothing still sees its own assignment.
        ...bindables.flatMap((b) => [
            `    bind(${NS}, '${b}', () => (${read(b)}(), follow((__props.${b} !== undefined ? __props.${b} : ${local(b)}.value) ?? NONE)),` +
                ` (v) => { ${local(b)}.value = track(v, ${bump(b)}, ${read(b)});` +
                ` if (!__initialising) __ctx.emit('update:${b}', __pybridge.bound(v)); });`,
            // The same name again, under a spelling the template can write to.
            // Vue refuses a v-model aimed at a declared prop; this one is
            // declared as nothing, so its write reaches the accessor above and
            // the accessor does the announcing.
            `    bind(${NS}, '__model_${b}', () => __pybridge.bound(${NS}.${b}), (v) => { ${NS}.${b} = v; });`
        ]),
        // Reading the ref is what registers the dependency, and `triggerRef`
        // fires that same dependency without the value ever changing identity:
        // one signal per name, where Svelte's `$state.raw` needed a second one
        // beside it because it drops a write unchanged by `===`.
        ...state.map(
            (n) =>
                `    bind(${NS}, '${n}', () => ${ref(n)}.value,` +
                ` (v) => { ${ref(n)}.value = track(v, ${bump(n)}, ${read(n)}); });`
        ),
        ...written.map(
            (f) => `    bind(${NS}, '${f.name}', () => ${fn(f.name)}.value, (v) => { ${fn(f.name)}.value = v; });`
        ),
        ...lifted.map(
            (f) =>
                `    bind(${NS}, '${f.name}', () => template(${fn(f.name)}.value, ${where(f.name)}, ${lineOffset}),` +
                ` (v) => { ${fn(f.name)}.value = v; });`
        ),
        ...inspects.map(
            (i) => `    bind(${NS}, '${i.name}', () => ${fn(i.name)}.value, (v) => { ${fn(i.name)}.value = v; });`
        ),
        // follow(): a derived that hands back a container it was given is the
        // one place the marker cannot travel by itself, because Vue compares a
        // computed's result before waking its readers.
        ...deriveds.map(
            (d) => `    bind(${NS}, '${d.name}', () => follow(${memo(d.name)}.value), (v) => { ${fn(d.name)}.value = v; });`
        ),
        // A root's name reads as its stopper, exactly as JavaScript reads
        // `const stop = effectScope()`; the setter still takes the function,
        // since that is what Brython writes when the `def` runs.
        ...effects.map((e) =>
            e.root
                ? `    bind(${NS}, '${e.name}', () => () => ${scope(e.name)} && ${scope(e.name)}.stop(), (v) => { ${fn(e.name)}.value = v; });`
                : `    bind(${NS}, '${e.name}', () => ${fn(e.name)}.value, (v) => { ${fn(e.name)}.value = v; });`
        ),
        ``,
        // What a compiled template expression calls. They live in the namespace
        // like everything else, so Python reaches them by name and Vue reaches
        // them as `_ctx.__text` — one binding, both sides.
        `    const __event = (f) => pyEvent(f, ${lineOffset});`,
        `    bind(${NS}, '__event', () => __event, () => {});`,
        // What `(name := value)` in a handler compiles to. The write goes
        // through the namespace, so through the accessor, so the ref fires —
        // which is the whole reason the walrus can mean this here.
        `    const __assign = (name, value) => { ${NS}[name] = value; return value; };`,
        `    bind(${NS}, '__assign', () => __assign, () => {});`,
        `    bind(${NS}, '__setattr', () => writeAttr, () => {});`,
        `    bind(${NS}, '__setitem', () => writeItem, () => {});`,
        ...['truthy', 'str', 'seq', 'spread', 'bound'].map(
            (n) =>
                `    bind(${NS}, '__${n === 'str' ? 'text' : n}', () => __pybridge.${n}, () => {});`
        ),
        ...injections(declared, true).map((line) => `    ${line}`),
        // An `importjs` name is readable from Python too, not only from the
        // template: `jsCall` gives it a boundary so Python calls it with Python
        // values and reads the answer as Python. Wrapped once, because Python
        // compares a function by identity.
        ...jsLocals.map((n) => `    const ${jsBound(n)} = jsCall(${n});`),
        ...jsLocals.map(
            (n) => `    bind(${NS}, '${n}', () => ${jsBound(n)}, () => {});`
        ),
        ``,
        ...(bindables.length ? [`    let __initialising = true;`] : []),
        `    init(${NS});`,
        ...(bindables.length ? [`    __initialising = false;`] : []),
        // The author's own names, and nothing generated: an expression lifted
        // out of the template is not one of them, and neither is the lambda
        // Brython names for itself when it compiles an arrow.
        `    hide(${NS}, ${JSON.stringify(declared.filter((n) => !n.startsWith('_')))});`,
        ``,
        // Everything reactive is created *after* init(), because every one of
        // them runs its body at once and that body reads names the module has
        // only just bound.
        ...effects.flatMap((e) => {
            const run =
                `(__cleanup) => { const __d = ${fn(e.name)}.value();` +
                ` if (typeof __d === 'function') __cleanup(pyEvent(__d, ${lineOffset})); }`;
            // Vue's default flush is 'pre', which is what `@effect.pre` means;
            // 'post' runs after the DOM has been patched, which is what a plain
            // effect means on both sides.
            const options = e.pre ? '' : `, { flush: 'post' }`;

            return e.root
                ? [
                      `    ${scope(e.name)} = effectScope();`,
                      `    ${scope(e.name)}.run(() => watchEffect(${run}${options}));`
                  ]
                : [`    watchEffect(${run}${options});`];
        }),
        // Vue has no `$inspect`, so this is the whole of it: an effect that
        // re-reads the values through the accessors and logs them. Dropped by
        // the bundler in a production build, because `import.meta.env.DEV` is a
        // literal there and the branch is dead.
        ...inspects.map(
            (i) =>
                `    if (import.meta.env.DEV) watchEffect(() => { const __v = ${fn(i.name)}.value();` +
                (i.logger
                    ? ` const [__log, ...__rest] = __v; pyEvent(__log, ${lineOffset})(...__rest.map(plainData)); });`
                    : ` console.log('inspect', ...__v.map(plainData)); });`)
        ),
        ...(lifecycle('on_mount')
            ? [`    onMounted(() => pyEvent(${fn('on_mount')}.value, ${lineOffset})());`]
            : []),
        ...(lifecycle('on_destroy')
            ? [`    onUnmounted(() => pyEvent(${fn('on_destroy')}.value, ${lineOffset})());`]
            : []),
        // After init(), because that is when the `def` has run and there is
        // something to expose. The boundary is the handler's, not the module
        // export's: a parent calls this from JavaScript, so the arguments cross
        // as Python and a coroutine is handed to Brython's loop.
        ...(exposed.length
            ? [
                  `    __ctx.expose({ ${exposed
                      .map((f) => `${f.name}: pyEvent(${fn(f.name)}.value, ${lineOffset})`)
                      .join(', ')} });`
              ]
            : []),
        ``,
        // The measurement this whole port was built to make: the object Brython
        // writes into is the object Vue reads from.
        `    return ${NS};`,
        `  }`,
        `};`
    ].join('\n');
}

module.exports = { compile, VIRTUAL_PREFIX, virtualId, surface, takeArrows, EXPR_PREFIX };
