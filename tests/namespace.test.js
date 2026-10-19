import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import { toRaw, nextTick } from 'vue';

import Counter from '../demo/Counter.vue';

// The measurement the port was built to make.
//
// Svelte compiles a component's script into lexical bindings of its own, so
// Svelthon has to build a *second* object beside them and keep the two in step:
// an accessor for Brython, a `const` for the template. Vue's `setup()` returns
// an object and reads the template out of it, so there is only ever one object —
// the namespace Brython writes into is the setup state Vue reads from.
//
// Everything below asks the same question three ways, because "the same object"
// is exactly the kind of claim that is easy to write and easy to be wrong about.
describe('the object setup() returns', () => {
    const raw = (page) => toRaw(page.vm.$.setupState);

    test('holds accessors, not copied values', () => {
        const descriptor = Object.getOwnPropertyDescriptor(raw(mount(Counter)), 'count');

        // A data property would mean Vue is reading a snapshot taken when
        // setup() ran, and Python writing somewhere nobody looks.
        expect(typeof descriptor.get).toBe('function');
        expect(descriptor.value).toBeUndefined();
    });

    // Own, not inherited: `hasSetupBinding` calls `hasOwn(setupState, key)`, so
    // a name on a prototype is a name the template silently cannot read. This is
    // the one place Vue is stricter than Svelte, and the reason the runtime has
    // to intercept `delete_for_reassign`.
    test('holds them as own properties', () => {
        expect(Object.prototype.hasOwnProperty.call(raw(mount(Counter)), 'count')).toBe(true);
    });

    test('and is the namespace Brython writes into', async () => {
        const page = mount(Counter);

        expect(page.get('p').text()).toBe('0 / 0');

        // Written from JavaScript, through the accessor, with no Vue API in
        // between. If this were a copy, the DOM would not move.
        raw(page).count = 20;
        await nextTick();

        expect(page.get('p').text()).toBe('20 / 40');
    });
});

// A rebinding — `count = count + 1` rather than `count += 1` — makes Brython
// delete the name from its namespace before assigning it. On an own accessor
// that delete is fatal and silent: the first write works and every one after it
// writes a plain property nothing is watching.
test('a rebinding does not unhook the accessor', async () => {
    const page = mount(Counter);
    const namespace = toRaw(page.vm.$.setupState);

    await page.get('button').trigger('click');
    await page.get('button').trigger('click');

    expect(page.get('p').text()).toBe('2 / 4');
    expect(typeof Object.getOwnPropertyDescriptor(namespace, 'count').get).toBe('function');
});

// Vue walks the setup state in development to mirror it onto the render
// context, and warns about anything beginning with `_` or `$`. Brython's own
// `__file__` and `$annotations` are in there, and so is every function the
// markup pass lifted out of the template.
test('and shows the author their own names, and nothing else', () => {
    expect(Object.keys(toRaw(mount(Counter).vm.$.setupState))).toEqual([
        'count',
        'increment',
        'doubled'
    ]);
});
