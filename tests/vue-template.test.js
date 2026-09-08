import { test, expect, describe } from 'vitest';
import { compile } from '@vue/compiler-dom';

// Properties of Vue's own template language that the walker has to live with.
// They are Vue's, not ours, and they are pinned here so that a Vue release
// changing one turns this red before the walker breaks.
const rendered = (template) =>
    compile(template, { prefixIdentifiers: true, mode: 'module' })
        .code.split('\n')
        .filter((line) => line.includes('_ctx.'))
        .map((line) => line.trim())
        .join(' | ');

// A directive's value is an HTML attribute value, so it is parsed as HTML
// *before* it is parsed as an expression. Two grammars stacked in one string,
// and the outer one runs first.
describe('an expression inside an attribute goes through HTML first', () => {
    test('entities are decoded before the expression is read', () => {
        expect(rendered('<p v-if="a &lt; b">x</p>')).toBe('return (_ctx.a < _ctx.b)');
        expect(rendered('<p v-if="a &amp;&amp; b">x</p>')).toBe('return (_ctx.a && _ctx.b)');
    });

    // Which means one program has two valid spellings, and they compile the same.
    test('so the escaped and unescaped forms are the same program', () => {
        expect(rendered('<p v-if="a &lt; b">x</p>')).toBe(rendered('<p v-if="a < b">x</p>'));
    });
});

// Two attributes on one tag have no order, so a precedence rule has to exist.
// Vue 2 gave `v-for` the higher priority; Vue 3 gives it to `v-if`, which is why
// their own style guide says never to write both on one element.
test('v-if wins over v-for, so the loop name is not in scope for the condition', () => {
    const out = rendered('<li v-for="x in xs" v-if="x">{{ x }}</li>');

    // The condition reads `_ctx.x` — the *outer* x — while the loop declares its
    // own. Written the other way round, `{#if}` inside `{#each}`, the question
    // could not be asked.
    expect(out).toContain('_ctx.x');
    expect(out).toContain('_ctx.xs');
});

// And a v-model has to be an lvalue, which is the one place Vue admits that the
// value after `=` is not an expression at all.
test('v-model refuses anything that is not a member expression', () => {
    expect(() => rendered('<input v-model="f()">')).toThrow(/member expression/);
    expect(() => rendered('<input v-model="a">')).not.toThrow();
});
