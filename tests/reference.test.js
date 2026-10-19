// **A handler written as a name is called**, as Vue calls `@click="add"`: with
// every argument the event carries, trimmed to what the function declares, and
// the name read when the event fires.
import { test, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import Reference from './Reference.vue';

// A child that emits two arguments, which a reference receives both of.
const Pick = defineComponent({
    emits: ['pick'],
    setup: (_, { emit }) => () => h('button', { class: 'pick', onClick: () => emit('pick', 'x', 'y') }, 'pick')
});

const page = () => mount(Reference, { global: { components: { Pick } } });

test('a name with no parameter is called without the event', async () => {
    const wrapper = page();

    await wrapper.get('.add').trigger('click');
    expect(wrapper.get('p').text()).toBe('add');
});

test('a name with one parameter receives the event', async () => {
    const wrapper = page();

    await wrapper.get('.kind').trigger('click');
    expect(wrapper.get('p').text()).toBe('click');
});

test('a dotted name is a bound method', async () => {
    const wrapper = page();

    await wrapper.get('.box').trigger('click');
    await wrapper.get('.box').trigger('click');
    expect(wrapper.get('p').text()).toBe('box1 box2');
});

test('a modifier keeps the reference', async () => {
    const wrapper = page();

    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('p').text()).toBe('add');
});

test("a component's event hands every argument over", async () => {
    const wrapper = page();

    await wrapper.get('.pick').trigger('click');
    expect(wrapper.get('p').text()).toBe('xy');
});

test("an error names the file's own line", async () => {
    const errors = [];
    const wrapper = mount(Reference, {
        global: { components: { Pick }, config: { errorHandler: (error) => errors.push(error.message) } }
    });

    await wrapper.get('.fail').trigger('click');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^ValueError: no \(fail\(\) — \S*Reference\.vue:31\)$/);
});

test('a rebound name is the one called', async () => {
    const wrapper = page();

    await wrapper.get('.swap').trigger('click');
    await wrapper.get('.add').trigger('click');
    expect(wrapper.get('p').text()).toBe('other');
});
