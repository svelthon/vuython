import { test, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { toRaw, nextTick } from 'vue';

import Lifecycle from '../src/Lifecycle.vue';

// `@derived` on a def is `=>` with a body instead of one line, and the name
// reads as the result on both sides: Python reads `bar` and gets the string.
test('a derived written as a decorator', async () => {
    const page = mount(Lifecycle);

    expect(page.get('p').text()).toBe('###');

    await page.get('button').trigger('click');

    expect(page.get('p').text()).toBe('####');
});

// A convention rather than an import: a def of that name is wired to the
// framework's own hook, which is `onMounted` and `onUnmounted` here.
test('on_mount and on_destroy, by name', async () => {
    const page = mount(Lifecycle);
    // Spread, because a Brython list is a JavaScript array carrying an
    // `ob_type` property, and a deep comparison sees it.
    const log = () => [...toRaw(page.vm.$.setupState).log];

    await nextTick();

    expect(log()).toEqual(['mount']);

    page.unmount();

    expect(log()).toEqual(['mount', 'destroy']);
});
