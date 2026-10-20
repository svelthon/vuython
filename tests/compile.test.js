// @vitest-environment node
//
// The compiler runs in Vite's own process, where there is no DOM: brython.js
// dereferences `document.currentScript` when it finds one, and jsdom provides a
// document whose currentScript is null.
import { test, expect, describe } from 'vitest';
// Brycomp, under the compiler, starts the engine and its parsing chain itself.
import { compile } from '../src/lib/compile.js';

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

    // The arrow with nothing to name is an effect, as `f()` alone is `x = f()`
    // with nothing to keep. Both spellings of a bindable reach the same place.
    test('the nameless arrow is an effect', () => {
        const out = script('count = 0\n=> js_log(count)');

        expect(out).toContain('watchEffect(');
        expect(out).toContain("{ flush: 'post' }");
    });

    test('and `bindable()` is the long form of `<=>`', () => {
        for (const source of ['value: str <=> ""', 'value: str = bindable("")']) {
            expect(script(source), source).toContain('emits: ["update:value"],');
        }
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
    // All three, not the two whose emitted identity happens to be spelled
    // `(f) => f`: `bindable` is `(v) => v`, and it escaped the lock for as long
    // as the lock was inferred from that string.
    test('any one of its own words, redefined', () => {
        for (const word of ['derived', 'bindable', 'effect']) {
            expect(() => script(`${word} = 1`), word).toThrow(/one of Vuython's own words/);
        }
    });

    // And the helpers are not words: a module defining its own `to_js` shadows
    // ours, as a Python module defining `list` loses the builtin.
    test('but not a helper, which is shadowable', () => {
        const out = script('to_js = 1');

        // The name is still bound — it is the author's state now — and what is
        // gone is the injection behind it.
        expect(out).toContain("bind(__py, 'to_js', () => __ref_to_js.value");
        expect(out).not.toContain('() => plainData');
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

// A source map, so a debugger opens the .vue rather than the JavaScript Brython
// generated from it. The mapping is read out of the `$B.set_lineno` markers the
// codegen plants, and every pass upstream is careful to preserve line numbers —
// which is why `importjs` blanks its line instead of removing it.
describe('the source map', () => {
    const decode = (mappings) =>
        mappings.split(';').map((segment) => {
            if (!segment) return null;

            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            const values = [];
            let value = 0;
            let shift = 0;

            for (const char of segment) {
                const digit = chars.indexOf(char);
                value += (digit & 31) << shift;

                if (digit & 32) {
                    shift += 5;
                } else {
                    values.push(value & 1 ? -(value >> 1) : value >> 1);
                    value = shift = 0;
                }
            }

            return values[2];
        });

    test('names the file and carries its text', () => {
        const { map } = compile('x = 1', 'Probe', 'src/Probe.vue', { sourceContent: '<whole file>' });

        expect(map.sources).toEqual(['src/Probe.vue']);
        expect(map.sourcesContent).toEqual(['<whole file>']);
    });

    // Line 3 of the Python, in a file whose script tag starts on line 6.
    test('and points at the line the author wrote', () => {
        const { map } = compile('a = 1\nb = 2\nc = 3', 'Probe', 'Probe.vue', { lineOffset: 6 });
        const lines = decode(map.mappings).filter((one) => one !== null);

        // Deltas, decoded back to absolute: the first statement is Python line
        // 1, which is file line 7.
        let at = 0;
        const absolute = lines.map((delta) => (at += delta));

        expect(absolute[0]).toBe(6);
        expect(Math.max(...absolute)).toBe(8);
    });
});

// `__all__` is Python's own way of saying what a module exports.
describe('__all__', () => {
    const moduleOf = (src) => compile(src, 'Store', 'store.py', { module: true }).script;

    test('narrows what a module hands JavaScript', () => {
        const out = moduleOf('__all__ = ["a"]\n\ndef a():\n    pass\n\ndef b():\n    pass');

        expect(out).toContain('export const a =');
        expect(out).not.toContain('export const b =');
    });

    // An ES module has no live named export, so state exported by value would be
    // a snapshot that never moves again — silently, which is the one behaviour
    // worth refusing outright.
    test('and refuses a name that is not a function', () => {
        expect(() => moduleOf('__all__ = ["total"]\n\ntotal = 0')).toThrow(/stays live/);
    });
});
