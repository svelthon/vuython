import { test, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import App from '../src/App.vue';
import Field from '../src/Field.vue';

// Nothing registered from the outside: App names its own children with
// `importjs`, which is both a Python binding and a `components` entry.
const page = () => mount(App);

// The whole page, assembled: six components, every one of them Python, and the
// only JavaScript in the project is the three lines of main.js.
test('the demo page renders', () => {
    const html = page().html();

    expect(html).toContain('Bonjour Florent!');
    expect(html).toContain('moyenne : 11.7');
    expect(html).toContain('lentilles : 3');
});

// A prop down: the parent's `qui` is a Python name, the child's `name` is
// another, and Vue's own props carry the value between them.
test('a parent s Python name reaches a child s prop', async () => {
    const app = page();

    await app.get('section input').setValue('Ada');

    expect(app.html()).toContain('Bonjour Ada!');
});

// And a prop back up: `<=>` is a prop plus an `update:value` event, which is
// what `v-model:value` binds to. Neither side wrote a line of JavaScript.
test('and a child s write reaches the parent s', async () => {
    const app = page();
    const field = app.findComponent(Field);

    await field.get('input').setValue('lentille');
    await nextTick();

    expect(app.text()).toContain('le parent lit : « lentille »');

    await field.get('button').trigger('click');
    await nextTick();

    expect(app.text()).toContain('le parent lit : «  »');
});
