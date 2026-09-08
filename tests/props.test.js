import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';

import Greeting from '../src/Greeting.vue';
import Field from '../src/Field.vue';

describe('a prop, declared by an annotation', () => {
    test('falls back to the default the Python body assigned', () => {
        expect(mount(Greeting).text()).toBe('Bonjour monde.');
    });

    test('takes the parent s value when there is one', () => {
        expect(mount(Greeting, { props: { name: 'Florent' } }).text()).toBe('Bonjour Florent.');
    });

    test('and follows the parent when it changes', async () => {
        const page = mount(Greeting, { props: { name: 'Ada' } });

        await page.setProps({ name: 'Grace', excited: true });

        expect(page.text()).toBe('Bonjour Grace!');
    });
});

describe('a bindable, written `<=>`', () => {
    // Vue has no two-way binding of its own: `v-model:value` is a prop plus an
    // `update:value` event, and that is what the arrow compiles to.
    test('announces a Python write upward', async () => {
        const page = mount(Field, { props: { value: 'salut' } });

        await page.get('button').trigger('click');

        expect(page.emitted('update:value')).toEqual([['']]);
    });

    test('and does not announce the default it assigns while initialising', () => {
        expect(mount(Field).emitted('update:value')).toBeUndefined();
    });

    test('still holds its own value when no parent bound it', async () => {
        const page = mount(Field);

        await page.get('input').setValue('x');
        await page.get('button').trigger('click');

        expect(page.get('input').element.value).toBe('');
    });
});
