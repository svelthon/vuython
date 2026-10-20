import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import Theme from '../demo/Theme.vue';
import TextBox from '../demo/TextBox.vue';

// Context is per component subtree, where a module is per application. Both are
// called while an instance initialises, which is exactly when the Python module
// body runs — so `provide(…)` written at the top level of the script lands in
// the right place with no ceremony.
describe('provide and inject', () => {
    test('a child reads what its parent provided', () => {
        expect(mount(Theme).get('.badge').text()).toBe('green');
    });

    test('and follows it when the parent moves it', async () => {
        const page = mount(Theme);

        await page.get('button').trigger('click');
        await nextTick();

        expect(page.get('.badge').text()).toBe('red');
    });

    test('a child with no provider gets the fallback', () => {
        const page = mount(Theme, { global: { provide: {} } });

        expect(page.get('.badge').text()).toBe('green');
    });
});

// `@export` is what Vue writes as `defineExpose`: the one way out of a component
// that is neither a prop nor an event.
describe('@export', () => {
    test('a decorated def is reachable from a parent', async () => {
        const page = mount(TextBox);

        page.vm.fill('hello');
        await nextTick();

        expect(page.get('.text').text()).toBe('hello');
    });

    // The call form, for a body that fits on one line — and the shape Vue's own
    // `defineExpose({ clear })` has.
    test('and so is the call form', async () => {
        const page = mount(TextBox);

        page.vm.fill('hello');
        page.vm.clear();
        await nextTick();

        expect(page.get('.text').text()).toBe('');
    });

    // What a real parent reaches through a template ref is `exposed`, and only
    // the two marked names are in it. (`page.vm` is not that object: test-utils
    // hands back the public instance proxy on purpose, which reaches the whole
    // setup state — that is its own choice, not a leak of ours.)
    test('and nothing else is', () => {
        expect(Object.keys(mount(TextBox).vm.$.exposed)).toEqual(['fill', 'clear']);
    });
});
