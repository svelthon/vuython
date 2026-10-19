import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';

import Liste from '../demo/Liste.vue';

// Three things that needed no work at all, checked rather than assumed. Each is
// a place where Svelthon had to build something and Vuython inherits Vue's.
describe('what Vue already does', () => {
    // Svelte's snippets had to be taught to the walker — the name is hoisted, so
    // one pass left to right could not see it. A Vue slot is an element, its
    // scope is the block, and the walker's own element scoping already covers it.
    test('a scoped slot carries Python into the parent s markup', () => {
        expect(mount(Liste).findAll('.ligne').map((b) => b.text())).toEqual([
            '1 — RIZ',
            '2 — LENTILLES'
        ]);
    });

    test('and the default content is the parent s too', () => {
        expect(mount(Liste).get('.defaut').text()).toBe('2 en réserve');
    });

    // `as {id, name}` is a dialect word in Svelthon, because Python unpacks by
    // position and only `match` unpacks by key. Here it is JavaScript's own
    // destructuring, and a Brython dict exposes its keys as ordinary JavaScript
    // properties — so Vue reaches them with nothing added.
    test('a dict is unpacked by key with no dialect at all', () => {
        expect(mount(Liste).findAll('.destructure').map((p) => p.text())).toEqual([
            '7:sel',
            '8:poivre'
        ]);
    });
});

// Svelte's `bind:group` is a directive Svelthon had to compile. Vue folds it
// into v-model, and v-model reaches a Python name with nothing in between.
describe('a group of inputs', () => {
    test('checkboxes collect into a Python list', async () => {
        const page = mount(Liste);
        const boxes = page.findAll('input[type=checkbox]');

        await boxes[0].setValue(true);
        await boxes[1].setValue(true);

        expect(page.get('.coches').text()).toBe("['riz', 'sel']");

        await boxes[0].setValue(false);

        expect(page.get('.coches').text()).toBe("['sel']");
    });

    // The directive writes a JavaScript array, and an array is not a list:
    // Brython reads one it did not make as a `JavascriptArray`, which prints
    // `[riz, sel]` and answers AttributeError to `.append`. Told apart by
    // `ob_type`, which every Brython value carries and no foreign array has.
    test('and what it wrote is a real Python list', async () => {
        const page = mount(Liste);

        await page.findAll('input[type=checkbox]')[0].setValue(true);
        await page.get('.ajoute').trigger('click');

        expect(page.get('.coches').text()).toBe("['riz', 'poivre']");
    });

    test('and radios pick one', async () => {
        const page = mount(Liste);

        await page.findAll('input[type=radio]')[1].setValue(true);

        expect(page.get('.choix').text()).toBe('b');
    });
});
