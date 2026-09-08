import { test, expect, describe } from 'vitest';
import { overTemplate, pythonExpressions, collector, renameModels } from '../src/lib/markup.js';

const rewrite = (markup) => {
    const defs = [];
    return { out: pythonExpressions(markup, collector(defs)), defs };
};

describe('every place an expression can hide', () => {
    test('an interpolation goes through Python s str()', () => {
        const { out, defs } = rewrite('<p>{{ notes }}</p>');

        expect(out).toBe('<p>{{ __expr_0() }}</p>');
        expect(defs[0]).toBe('def __expr_0():\n    return __text(notes)');
    });

    test('a condition goes through Python s bool()', () => {
        const { defs } = rewrite('<p v-if="notes">x</p>');

        expect(defs[0]).toContain('__truthy(notes)');
    });

    test('an attribute keeps None out of the DOM', () => {
        const { defs } = rewrite('<a :href="link">x</a>');

        expect(defs[0]).toContain('__bound(link)');
    });

    test('and every directive that takes one is read the Python way', () => {
        const cases = [
            ['<p v-show="notes">x</p>', '__truthy(notes)'],
            ['<p v-else-if="notes">x</p>', '__truthy(notes)'],
            ['<p v-text="notes"></p>', '__text(notes)'],
            ['<p v-html="body"></p>', '__text(body)'],
            ['<p v-bind:id="key">x</p>', '__bound(key)'],
            ['<p v-bind="attrs">x</p>', '__spread(attrs)']
        ];

        for (const [markup, expected] of cases) {
            expect(rewrite(markup).defs[0], markup).toContain(expected);
        }
    });

    // A dict, a set, a range and a generator are not JavaScript arrays, and
    // iterating those is the whole point of writing the loop in Python.
    test('a list is materialised', () => {
        const { out, defs } = rewrite('<li v-for="n in notes">{{ n }}</li>');

        expect(out).toBe('<li v-for="n in __expr_0()">{{ __expr_1(n) }}</li>');
        expect(defs[0]).toContain('__seq(notes)');
        expect(defs[1]).toBe('def __expr_1(n):\n    return __text(n)');
    });

    test('and its alias is out of scope while its own iterable compiles', () => {
        const { defs } = rewrite('<li v-for="n in n">{{ n }}</li>');

        expect(defs[0]).toBe('def __expr_0():\n    return __seq(n)');
    });

    test('a nested loop stacks both names', () => {
        const { defs } = rewrite('<li v-for="r in rows"><b v-for="c in r">{{ c + r }}</b></li>');

        expect(defs.at(-1)).toBe('def __expr_2(r, c):\n    return __text(c + r)');
    });

    test('and the scope closes with the element', () => {
        const { defs } = rewrite('<li v-for="n in notes">{{ n }}</li><p>{{ total }}</p>');

        expect(defs.at(-1)).toBe('def __expr_2():\n    return __text(total)');
    });

    // Vue's own reading, kept: `(value, index)` over a list, `(value, key)` over
    // a dict. Tuple unpacking is JavaScript array destructuring here, because a
    // Python tuple *is* a JavaScript array.
    test('an index, and a tuple taken apart', () => {
        expect(rewrite('<li v-for="(n, i) in notes">{{ i }}</li>').defs.at(-1)).toContain('(n, i)');
        expect(rewrite('<li v-for="[k, v] in d.items()">{{ k }}</li>').defs.at(-1)).toContain('(k, v)');
    });

    test('a slot names its own scope', () => {
        const { defs } = rewrite('<Card v-slot="row">{{ row.title }}</Card>');

        expect(defs[0]).toBe('def __expr_0(row):\n    return __text(row.title)');
    });
});

describe('a handler, told apart the way Vue tells them apart', () => {
    // Vue keeps a member expression and calls it itself, and wraps anything else
    // in `$event => { … }`. The line is drawn here on the Python, which is the
    // only place the information still exists once it is taken away.
    test('a call becomes an inline statement, and receives the event', () => {
        const { out, defs } = rewrite('<button @click="add(1)">x</button>');

        expect(out).toBe('<button @click="__expr_0($event)">x</button>');
        expect(defs[0]).toBe('def __expr_0(event):\n    return add(1)');
    });

    test('a name is handed over as a function', () => {
        const { out, defs } = rewrite('<button @click="add">x</button>');

        expect(out).toBe('<button @click="__event(__expr_0())">x</button>');
        expect(defs[0]).toBe('def __expr_0():\n    return add');
    });

    test('and a modifier stays Vue s', () => {
        expect(rewrite('<form @submit.prevent="save()">x</form>').out).toContain(
            '@submit.prevent="__expr_0($event)"'
        );
    });
});

describe('what the walker refuses to touch', () => {
    test('a plain attribute', () => {
        expect(rewrite('<input type="number" placeholder="{{ x }}">').out).toBe(
            '<input type="number" placeholder="{{ x }}">'
        );
    });

    test('a v-model, which reaches the name with nothing in between', () => {
        expect(rewrite('<input v-model="entry">').out).toBe('<input v-model="entry">');
    });

    test('a comment, whose text may hold anything', () => {
        expect(rewrite("<!-- aujourd'hui {{ x }} -->{{ y }}").out).toBe(
            "<!-- aujourd'hui {{ x }} -->{{ __expr_0() }}"
        );
    });

    // An attribute value full of `<` and `>` is what a Python condition looks
    // like, and a naive scan would end the tag inside one.
    test('and a comparison inside an attribute does not close the tag', () => {
        const { out } = rewrite('<p v-if="a < b and c > d">{{ a }}</p>');

        expect(out).toBe('<p v-if="__expr_0()">{{ __expr_1() }}</p>');
    });
});

describe('the boundaries of the template block', () => {
    test('only the template is walked', () => {
        const content = '<script lang="python">\nx = {{ 1 }}\n</script>\n<template>{{ x }}</template>';
        const out = overTemplate(content, (markup) => pythonExpressions(markup, collector([])));

        expect(out).toContain('x = {{ 1 }}');
        expect(out).toContain('<template>{{ __expr_0() }}</template>');
    });

    test('and a nested template does not end it early', () => {
        const content = '<template><template v-if="a">{{ b }}</template>{{ c }}</template>';
        const defs = [];

        overTemplate(content, (markup) => pythonExpressions(markup, collector(defs)));

        expect(defs).toHaveLength(3);
    });
});

// Vue refuses a v-model aimed at a declared prop, and it is right to: a Vue prop
// is read-only. A Vuython bindable is not, so the name is aimed at a second
// accessor that is declared as nothing.
describe('a v-model on a name that travels both ways', () => {
    test('is aimed at the writable spelling', () => {
        expect(renameModels('<input v-model="value">', ['value'])).toBe(
            '<input v-model="__model_value">'
        );
    });

    test('with its argument and modifiers kept', () => {
        expect(renameModels('<X v-model:value.lazy="value" />', ['value'])).toBe(
            '<X v-model:value.lazy="__model_value" />'
        );
    });

    test('and every other name is left alone', () => {
        expect(renameModels('<input v-model="entry">', ['value'])).toBe('<input v-model="entry">');
    });
});
