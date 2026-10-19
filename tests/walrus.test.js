import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import { walrus } from '../src/lib/markup.js';

import Walrus from '../demo/Walrus.vue';

describe('what the walrus compiles to', () => {
    test('a name goes through the namespace, so the accessor fires', () => {
        expect(walrus('ouvert := not ouvert')).toBe("__assign('ouvert', not ouvert)");
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

        expect(page.get('.bascule').text()).toBe('False');

        await page.get('.bascule').trigger('click');

        expect(page.get('.bascule').text()).toBe('True');
    });

    test('several at once', async () => {
        const page = mount(Walrus);

        await page.get('.deux').trigger('click');

        expect(page.get('.deux').text()).toBe('1');
        expect(page.get('.bascule').text()).toBe('True');
    });

    // The dot writes where the dot read: an existing key wins over an
    // attribute, so the field does not snap back on the next render.
    test('and an attribute or a key on a dict', async () => {
        const page = mount(Walrus);

        await page.get('.champ').trigger('click');
        await page.get('.cle').trigger('click');

        expect(page.get('.champ').text()).toBe('1');
        expect(page.get('.cle').text()).toBe('relu');
    });
});
