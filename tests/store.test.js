import { test, expect, describe, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import Shop from '../demo/Shop.vue';
// A module's functions are exported to JavaScript too, so a test can reset the
// state a whole file shares — which is the point of a module-scope ref, and the
// reason it has to be reset between tests at all.
import { empty } from '../demo/cart.py';

beforeEach(() => empty());

// A shared module is an ordinary `.py`. Its names are refs at module scope, so
// they are created once for the whole application, and two components reading it
// read the same state.
describe('a shared .py module', () => {
    test('is empty until something puts a line in it', () => {
        expect(mount(Shop).get('.summary').text()).toBe('empty cart');
    });

    // `cart.add(…)` in one component, read by another. Nothing was passed
    // between them: both reach the module by its Python name.
    test('carries state between two components', async () => {
        const page = mount(Shop);

        await page.findAll('button')[0].trigger('click');
        await nextTick();

        expect(page.get('.summary').text()).toBe('1 item(s), €3');
        expect(page.findAll('li').map((li) => li.text())).toEqual(['lentils']);
    });

    // `lines.append(…)` happens inside the module, on a list the component
    // never touches — and the derived above it follows.
    test('and a mutation made inside the module reaches both of them', async () => {
        const page = mount(Shop);

        await page.findAll('button')[0].trigger('click');
        await page.findAll('button')[1].trigger('click');
        await nextTick();

        expect(page.get('.summary').text()).toBe('2 item(s), €5');

        await page.get('.empty').trigger('click');
        await nextTick();

        expect(page.get('.summary').text()).toBe('empty cart');
    });
});
