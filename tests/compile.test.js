// @vitest-environment node
//
// The compiler runs in Vite's own process, where there is no DOM: brython.js
// dereferences `document.currentScript` when it finds one, and jsdom provides a
// document whose currentScript is null.
import { test, expect, describe } from 'vitest';
import { createRequire } from 'node:module';

const { compile } = createRequire(import.meta.url)('../src/lib/compile.cjs');

const script = (source, defs = []) => compile(source, 'Probe', 'Probe.vue', { defs }).script;

describe('what one module-level name costs', () => {
    // One ref, not two. `triggerRef` fires the dependents of the very ref the
    // accessor reads, so an in-place mutation needs no second signal beside the
    // value — which is what `$state.raw` needed under Svelte, because it drops a
    // write whose value is unchanged by `===`.
    test('a state name is one shallowRef', () => {
        const out = script('count = 0');

        expect(out.match(/shallowRef\(/g)).toHaveLength(1);
        expect(out).toContain('const __bump_count = () => triggerRef(__ref_count);');
        expect(out).toContain("bind(__py, 'count', () => __ref_count.value,");
    });

    test('a derived is a computed over the Python function', () => {
        const out = script('count = 0\ndoubled => count * 2');

        expect(out).toContain('const __memo_doubled = computed(() => __fn_doubled.value());');
        expect(out).toContain("bind(__py, 'doubled', () => follow(__memo_doubled.value)");
    });

    test('and an annotation is a declared prop', () => {
        expect(script('name: str = "x"')).toContain('props: { name: { default: undefined } },');
    });
});

describe('the flush an effect asks for', () => {
    // Vue's default is `pre`, which runs before the DOM is patched. A plain
    // effect means after, on both sides, so it has to say so.
    test('a plain effect runs after the DOM is patched', () => {
        expect(script('@effect\ndef e():\n    pass')).toContain("{ flush: 'post' }");
    });

    test('and @effect.pre takes Vue s default', () => {
        const out = script('@effect.pre\ndef e():\n    pass');

        expect(out).toContain('watchEffect(');
        expect(out).not.toContain('flush');
    });

    test('a root gets a scope, and its name reads as the stopper', () => {
        const out = script('@effect.root\ndef e():\n    pass');

        expect(out).toContain('__scope_e = effectScope();');
        expect(out).toContain("bind(__py, 'e', () => () => __scope_e && __scope_e.stop()");
    });
});

describe('what the namespace has to carry', () => {
    // Rebinding a global makes Brython delete the name first, and a plain
    // `delete` takes an own accessor with it. The flag is what the runtime looks
    // for when it declines to do that.
    test('the flag that survives a rebinding', () => {
        expect(script('count = 0')).toContain(
            "Object.defineProperty(__py, '$vuython', { value: true });"
        );
    });

    // Reading a global goes through resolve_in_namespace, which without this
    // demands an own property — and every declared name already is one, so an
    // unassigned name would read as bound rather than raising NameError.
    test('the flag that keeps NameError working', () => {
        expect(script('count = 0')).toContain('__py.$proxy = true;');
    });

    test('and only the author s names stay visible', () => {
        expect(script('count = 0\n\ndef go():\n    pass', ['def __expr_0():\n    return count']))
            .toContain('hide(__py, ["count","go"]);');
    });
});

describe('what the compiler refuses', () => {
    test('one of its own words, redefined', () => {
        expect(() => script('effect = 1')).toThrow(/one of Vuython's own words/);
    });

    test('an arrow indented under something', () => {
        expect(() => script('if True:\n    x => 1')).toThrow(/belong at the top level/);
    });

    test('and an arrow whose brackets do not close on its line', () => {
        expect(() => script('x => [1,')).toThrow(/must fit on one line/);
    });
});

// A Brython exception carries neither `message` nor `stack`, so a Python syntax
// error would reach Vite as an empty object and be reported as nothing at all.
test('a syntax error names the line, counted from the file', () => {
    expect(() => compile('x = (', 'Probe', 'Probe.vue', { lineOffset: 4 })).toThrow(
        /vuython — .*Probe\.vue:5/
    );
});
