import { test, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import Counter from '../src/Counter.vue';

test('a name assigned in Python renders, and a click moves it', async () => {
    const page = mount(Counter);

    expect(page.get('p').text()).toBe('0 / 0');

    await page.get('button').trigger('click');

    expect(page.get('p').text()).toBe('1 / 2');
});
