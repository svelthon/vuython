import { test, expect, describe, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import Boutique from '../src/Boutique.vue';
// A module's functions are exported to JavaScript too, so a test can reset the
// state a whole file shares — which is the point of a module-scope ref, and the
// reason it has to be reset between tests at all.
import { vider } from '../src/panier.py';

beforeEach(() => vider());

// A shared module is an ordinary `.py`. Its names are refs at module scope, so
// they are created once for the whole application, and two components reading it
// read the same state.
describe('a shared .py module', () => {
    test('is empty until something puts a line in it', () => {
        expect(mount(Boutique).get('.resume').text()).toBe('panier vide');
    });

    // `panier.ajouter(…)` in one component, read by another. Nothing was passed
    // between them: both reach the module by its Python name.
    test('carries state between two components', async () => {
        const page = mount(Boutique);

        await page.findAll('button')[0].trigger('click');
        await nextTick();

        expect(page.get('.resume').text()).toBe('1 article(s), 3 euros');
        expect(page.findAll('li').map((li) => li.text())).toEqual(['lentilles']);
    });

    // `lignes.append(…)` happens inside the module, on a list the component
    // never touches — and the derived above it follows.
    test('and a mutation made inside the module reaches both of them', async () => {
        const page = mount(Boutique);

        await page.findAll('button')[0].trigger('click');
        await page.findAll('button')[1].trigger('click');
        await nextTick();

        expect(page.get('.resume').text()).toBe('2 article(s), 5 euros');

        await page.get('.vider').trigger('click');
        await nextTick();

        expect(page.get('.resume').text()).toBe('panier vide');
    });
});
