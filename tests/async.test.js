import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import Async from '../src/Async.vue';

const settle = async () => {
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await nextTick();
};

// Calling an `async def` from a handler returns a coroutine that nobody runs:
// the click appears to do nothing at all, silently. Brython has its own event
// loop, so the boundary hands it over.
describe('an async def', () => {
    test('runs, and its writes reach the page as it goes', async () => {
        const page = mount(Async);

        await page.get('.charger').trigger('click');
        await nextTick();

        // The body up to the first `await` has already run.
        expect(page.get('.etat').text()).toBe('en cours');

        await settle();

        expect(page.get('.etat').text()).toBe('reçu : des lentilles');
    });

    // Brython's own loop, not the platform's: `aio.sleep` is a coroutine that
    // only means something to it.
    test('and awaits Brython s own primitives too', async () => {
        const page = mount(Async);

        await page.get('.dormir').trigger('click');
        await settle();

        expect(page.get('.etat').text()).toBe('réveillé');
    });

    // A rejected promise has to arrive as a Python exception, or `except` never
    // fires and the failure is silent twice over.
    test('and a rejection is catchable as a Python exception', async () => {
        const page = mount(Async);

        await page.get('.casser').trigger('click');
        await settle();

        expect(page.get('.erreur').text()).toContain('cassé');
    });
});
