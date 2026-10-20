import { test, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import App from '../demo/App.vue';
import Field from '../demo/Field.vue';

// Nothing registered from the outside: App names its own children with
// `importjs`, which is both a Python binding and a `components` entry.
const page = () => mount(App);

// The whole page, assembled: ten components, every one of them Python, and the
// only JavaScript in the project is the three lines of main.js.
test('the demo page renders', () => {
    const html = page().html();

    expect(html).toContain('Hello Ada!');
    expect(html).toContain('average: 11.7');
    expect(html).toContain('lentils: 3');
});

// A prop down: the parent's `who` is a Python name, the child's `name` is
// another, and Vue's own props carry the value between them.
test('a parent s Python name reaches a child s prop', async () => {
    const app = page();

    await app.get('section input').setValue('Grace');

    expect(app.html()).toContain('Hello Grace!');
});

// And a prop back up: `<=>` is a prop plus an `update:value` event, which is
// what `v-model:value` binds to. Neither side wrote a line of JavaScript.
test('and a child s write reaches the parent s', async () => {
    const app = page();
    const field = app.findComponent(Field);

    await field.get('input').setValue('lentil');
    await nextTick();

    expect(app.text()).toContain('the parent reads: “lentil”');

    await field.get('button').trigger('click');
    await nextTick();

    expect(app.text()).toContain('the parent reads: “”');
});
