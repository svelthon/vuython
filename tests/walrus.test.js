import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import { walrus } from '../src/lib/markup.js';

import Walrus from '../demo/Walrus.vue';

describe('what the walrus compiles to', () => {
    test('a name goes through the namespace, so the accessor fires', () => {
        expect(walrus('shown := not shown')).toBe("__assign('shown', not shown)");
    });

    test('an attribute and a key, which Python s own grammar refuses', () => {
        expect(walrus('row.qty := 1')).toBe("__setattr(row, 'qty', 1)");
        expect(walrus('d[k] := 1')).toBe('__setitem(d, k, 1)');
    });

    test('a group returns its last value', () => {
        expect(walrus('a := 1, b := 2')).toBe("(__assign('a', 1), __assign('b', 2))[-1]");
    });

    // A `:=` inside a string or inside brackets is not one of ours, and an
    // expression with none is handed back untouched.
    test('and anything that is not an assignment is left alone', () => {
        expect(walrus('save()')).toBe('save()');
        expect(walrus('say("a := b")')).toBe('say("a := b")');
    });
});

describe('a walrus in a handler', () => {
    test('rebinds a name', async () => {
        const page = mount(Walrus);

        expect(page.get('.toggle').text()).toBe('False');

        await page.get('.toggle').trigger('click');

        expect(page.get('.toggle').text()).toBe('True');
    });

    test('several at once', async () => {
        const page = mount(Walrus);

        await page.get('.both').trigger('click');

        expect(page.get('.both').text()).toBe('1');
        expect(page.get('.toggle').text()).toBe('True');
    });

    // The dot writes where the dot read: an existing key wins over an
    // attribute, so the field does not snap back on the next render.
    test('and an attribute or a key on a dict', async () => {
        const page = mount(Walrus);

        await page.get('.attr').trigger('click');
        await page.get('.key').trigger('click');

        expect(page.get('.attr').text()).toBe('1');
        expect(page.get('.key').text()).toBe('reviewed');
    });
});
