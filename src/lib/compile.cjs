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

// `doubled => count * 2` — a name bound to an expression that re-runs, which is
// the arrow Svelthon already carries. Nothing about it is Svelte's: it names a
// value computed from other names, and Vue calls that a `computed`.
const ARROW_DERIVED = /^([A-Za-z_]\w*)\s*=>\s*(\S[\s\S]*)$/;

// `=> expr` — the same arrow with nothing to name, which is the effect.
const ARROW_EFFECT = /^=>\s*(\S[\s\S]*)$/;

// `value: str <=>` — a prop that also travels back up. Under Vue that is a prop
// plus an `update:value` event, which is what `v-model:value` binds to.
const BINDABLE = /^([A-Za-z_]\w*\s*:\s*[^=<>]+?)\s*<=>\s*(\S[\s\S]*)?$/;

const ARROW_INDENTED = /^[ \t]+(?:[A-Za-z_]\w*\s*)?=>\s/;

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

        const both = quote === null && !found ? line.match(BINDABLE) : null;

        if (!found && !both) out.push(line);
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
    const seen = new Set();

    const take = (name) => {
        if (seen.has(name) || JS_RESERVED.has(name)) return false;
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
                    ...(root ? { root: true } : {})
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

    return { props, bindables, state, funcs, deriveds, effects };
}

// The words the compiler publishes into a module's namespace. The decorators
// only mark; the compiler has read them off the AST already, so what runs is the
// identity.
//
// `locked` is declared rather than inferred. It was inferred once, from the
// shape of the emitted value, and `bindable` — whose identity is `(v) => v` and
// not `(f) => f` — walked straight through the lock while the other two were
// held. A rule that reads a string to guess an intention holds only for as long
// as the two happen to agree.
const INJECTED = [
    { name: 'derived', value: '() => (f) => f', locked: true },
    { name: 'bindable', value: '() => (v) => v', locked: true },
    {
        name: 'effect',
        value: '() => Object.assign((f) => f, { pre: (f) => f, root: (f) => f })',
        locked: true
    },
    // The two bridges are helpers, not words: a module that defines its own
    // `to_js` shadows ours, exactly as a Python module defining `list` loses the
    // builtin.
    { name: 'to_js', value: '() => plainData' },
    { name: 'to_py', value: '() => pyData' }
];

// A locked name is Vuython's own word, not a builtin to shadow: refused rather
// than quietly given to either side.
function refuseLocked(declared, source) {
    const taken = INJECTED.find((one) => one.locked && declared.includes(one.name));

    if (!taken) return;

    throw new SyntaxError(
        `vuython — \`${taken.name}\` is one of Vuython's own words and cannot be ` +
            `redefined (${source})`
    );
}

const VIRTUAL_PREFIX = 'virtual:vuython/';
const virtualId = (name) => VIRTUAL_PREFIX + name;

function compile(
    src,
    name = 'Component',
    source = name,
    { defs = [], lineOffset = 0, title = name } = {}
) {
    // A `<script>` body sits inside markup and every Vue example indents it one
    // level; in JavaScript that is whitespace, in Python it is syntax. Brython's
    // own `unindent` is what it already runs on every `<script type="text/
    // python">`, so the two tags behave alike.
    //
    // It has to happen **before** the template defs are appended: those are
    // generated at column zero and would trip its conservative bail — one
    // non-blank line already at column zero and the source comes back untouched.
    const body = $B.unindent(src);

    src = defs.length ? `${body}\n${defs.join('\n\n')}\n` : body;
    src = takeArrows(src, source, lineOffset);

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

    const { props, bindables, state, funcs, deriveds, effects } = surface(root._ast.body);
    const js = root.to_js();
    const namespace = namespaceFor(source);

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
        ...effects.map((e) => e.name)
    ];

    refuseLocked(declared, source);

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

    return {
        script: componentScript(name, source, namespace, lineOffset, {
            props, bindables, state, funcs, deriveds, effects, declared, title
        }),
        module,
        bindables
    };
}

// The component Vue is handed.
//
// One `shallowRef` per module-level name, and one accessor per name on a single
// object — which `setup()` then returns *as is*. That object is the namespace
// Brython writes into and the setup state Vue reads from, at the same time and
// without a copy: Svelte needed a component-local `const` beside every accessor,
// because its template reads lexical bindings its compiler placed itself.
function componentScript(name, source, namespace, lineOffset, surfaced) {
    const { props, bindables, state, funcs, deriveds, effects, declared, title } = surfaced;

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
        .concat(lifecycle('on_destroy') ? ['onUnmounted'] : []);

    return [
        `import { init } from ${JSON.stringify(virtualId(name))};`,
        `import { ${imported.join(', ')} } from 'vue';`,
        `import { bind, hide, track, follow, template, pyError, pyEvent, plainData, pyData,` +
            ` __pybridge, NONE } from 'vuython/runtime';`,
        ``,
        `export default {`,
        `  name: ${JSON.stringify(title)},`,
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
        ...['truthy', 'str', 'seq', 'spread', 'bound'].map(
            (n) =>
                `    bind(${NS}, '__${n === 'str' ? 'text' : n}', () => __pybridge.${n}, () => {});`
        ),
        ...INJECTED.filter((one) => !declared.includes(one.name)).map(
            (one) => `    bind(${NS}, '${one.name}', ${one.value}, () => {});`
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
        ...(lifecycle('on_mount')
            ? [`    onMounted(() => pyEvent(${fn('on_mount')}.value, ${lineOffset})());`]
            : []),
        ...(lifecycle('on_destroy')
            ? [`    onUnmounted(() => pyEvent(${fn('on_destroy')}.value, ${lineOffset})());`]
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
