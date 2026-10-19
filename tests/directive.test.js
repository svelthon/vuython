import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import { toRaw, nextTick } from 'vue';

import Directive from '../demo/Directive.vue';

// Vue reads a directive off the `directives` option, which belongs to the
// *component* and not to an instance — where the Python function lives in a
// namespace one `setup()` built. `binding.instance` is what joins them.
//
// The trace is read off the namespace rather than rendered: a directive runs
// while Vue is patching, so a name it writes and the template reads would
// invalidate the render that is running.
const trace = (page) => [...toRaw(page.vm.$.setupState).trace];

describe('a directive written in Python', () => {
    test('gets the element, and the value', () => {
        const page = mount(Directive);

        expect(page.get('.cible').element.style.backgroundColor).toBe('gold');
        expect(trace(page)).toEqual(['pose gold']);
    });

    // Its own destructor runs first, so the directive never stacks: exactly what
    // an effect does when what it read has moved.
    test('runs again when the value moves, tearing down first', async () => {
        const page = mount(Directive);

        await page.get('.couleur').trigger('click');
        await nextTick();

        expect(page.get('.cible').element.style.backgroundColor).toBe('deepskyblue');
        expect(trace(page)).toEqual(['pose gold', 'retire', 'pose deepskyblue']);
    });

    test('and tears down when the element goes away', async () => {
        const page = mount(Directive);

        await page.get('.cacher').trigger('click');
        await nextTick();

        expect(page.find('.cible').exists()).toBe(false);
        expect(trace(page)).toEqual(['pose gold', 'retire']);
    });
});
