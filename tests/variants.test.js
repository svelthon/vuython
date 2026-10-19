import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import Variants from '../demo/Variants.vue';

describe('the three effects', () => {
    test('all run once the component exists', async () => {
        const page = mount(Variants);

        await nextTick();

        expect(page.get('p').text()).toBe('0 : 0 0 0');
    });

    // Nothing declared the dependency: the body reads `count`, the read goes
    // through the namespace accessor, and Vue discovers it by itself.
    test('and all re-run when what they read has moved', async () => {
        const page = mount(Variants);

        await page.get('.bump').trigger('click');
        await nextTick();

        expect(page.get('p').text()).toBe('1 : 1 1 1');
    });

    // The decorated name reads as the stopper on both sides: Python calls
    // `owned()` and the scope goes away, exactly as JavaScript calls the
    // function `effectScope()` handed back.
    test('and a root stops when its own name is called, while the others do not', async () => {
        const page = mount(Variants);

        await page.get('.stop').trigger('click');
        await page.get('.bump').trigger('click');
        await nextTick();

        expect(page.get('p').text()).toBe('1 : 1 1 0');
    });
});
