import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';

import Notes from '../demo/Notes.vue';

describe('the list a mutation moves', () => {
    test('renders what Python assigned', () => {
        const page = mount(Notes);

        expect(page.findAll('li').map((li) => li.text())).toEqual(['12 x', '15 x', '8 x']);
        expect(page.get('p').text()).toBe('moyenne : 11.7');
    });

    // `notes.append(15)` and nothing after it. No copy, no reassignment, and no
    // proxy either: Brython routes the call through `$B.call_attr`, which fires
    // the marker on the list, which calls `triggerRef` on the name's own ref.
    test('and moves when a method mutates it in place', async () => {
        const page = mount(Notes);

        await page.get('input').setValue('20');
        await page.get('form').trigger('submit');

        expect(page.findAll('li').map((li) => li.text())).toEqual(['12 x', '15 x', '8 x', '20 x']);
        expect(page.get('p').text()).toBe('moyenne : 13.8');
    });

    test('and when one is removed', async () => {
        const page = mount(Notes);

        await page.findAll('li')[1].get('button').trigger('click');

        expect(page.findAll('li').map((li) => li.text())).toEqual(['12 x', '8 x']);
    });

    // An empty Python list is false, where JavaScript calls every object truthy.
    test('an empty list is false the Python way', async () => {
        const page = mount(Notes);

        for (const li of page.findAll('li')) await li.get('button').trigger('click');

        expect(page.get('p').text()).toBe('aucune note');
    });
});

// v-model reaches the Python name directly: Vue compiles it to
// `_ctx.entry = $event`, and `entry` is an own property of the namespace.
test('v-model writes a Python name with nothing in between', async () => {
    const page = mount(Notes);

    expect(page.get('button').attributes('disabled')).toBeDefined();

    await page.get('input').setValue('17');

    expect(page.get('button').attributes('disabled')).toBeUndefined();
});
