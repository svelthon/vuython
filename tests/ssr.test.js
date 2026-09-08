// @vitest-environment node
//
// Server rendering, which is the one place the whole stack runs without a
// browser: Brython boots, the Python runs, and Vue renders to a string. Node,
// not jsdom, so what is exercised is really the absence of a DOM.
import { test, expect, describe } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

import Counter from '../src/Counter.vue';
import Notes from '../src/Notes.vue';
import Greeting from '../src/Greeting.vue';
import Rows from '../src/Rows.vue';

describe('a component rendered on the server', () => {
    test('runs its Python and renders what it assigned', async () => {
        expect(await renderToString(createSSRApp(Counter))).toContain('0 / 0');
    });

    test('with its props applied', async () => {
        const html = await renderToString(createSSRApp(Greeting, { name: 'Ada', excited: true }));

        expect(html).toContain('Bonjour Ada!');
    });

    // The template's Python semantics are not a browser feature: the list
    // renders through Python's own str(), the condition through its bool().
    test('and the template keeps Python s meaning', async () => {
        const html = await renderToString(createSSRApp(Notes));

        expect(html).toContain('moyenne : 11.7');
        expect(html).toContain('<li');
    });

    test('including the dot that finds a key', async () => {
        expect(await renderToString(createSSRApp(Rows))).toContain('lentilles');
    });
});
