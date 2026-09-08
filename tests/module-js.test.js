import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';

import Mesure from '../src/Mesure.vue';
import { moitie, ajouter } from '../src/mesures.py';

// `__js__` is `importjs` for a file with no markup. A module never asks for a
// default export, a stylesheet or a namespace — those are template concerns —
// so only the named form is left, and it stays real Python read off the AST
// where `importjs` had to become a keyword.
describe('__js__', () => {
    test('gives a plain .py its JavaScript', () => {
        expect(mount(Mesure).get('.moitie').text()).toBe('9.0');
    });

    // Through the boundary in both directions: called from JavaScript here, and
    // the answer is a Python float that Python arithmetic could use.
    test('and the module is callable from JavaScript too', () => {
        expect(moitie(9)).toBe(9);
    });
});

// `__all__` says what a JavaScript caller may reach. `total` is a derived and is
// not in the list, so it is not exported — the module's `state` is the live view.
test('__all__ narrows what the module hands out', async () => {
    expect(typeof ajouter).toBe('function');

    const page = mount(Mesure);
    const before = Number(page.get('.total').text());

    await page.get('.ajoute').trigger('click');
    await nextTick();

    expect(Number(page.get('.total').text())).toBe(before + 3);
});

// Vue's `useId()`: unique per instance, and stable across server and client so
// hydration does not object.
describe('props_id', () => {
    test('joins a label to its input', () => {
        const page = mount(Mesure);

        expect(page.get('label').attributes('for')).toBe(page.get('input').attributes('id'));
        expect(page.get('input').attributes('id')).toBeTruthy();
    });

    // Within one application, not across two: Vue's counter belongs to the app,
    // so two separate mounts both start at `v-0` and that is not a collision.
    // What has to differ is two instances on the same page.
    test('and two instances on one page do not collide', () => {
        const page = mount({ render: () => [h(Mesure), h(Mesure)] });
        const ids = page.findAll('input').map((one) => one.attributes('id'));

        expect(ids[0]).not.toBe(ids[1]);
    });
});
