// **A Python value handed to another module's function is the value itself**:
// a dict stays a dict, and what the function writes into it the caller reads.
// A module's namespace is published as a Python module (`registerModule`), so
// Brython hands its functions their arguments as Python hands them, unconverted.
import { test, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import Boundary from './Boundary.vue';

test("a dict crosses into another module's function as itself", () => {
    expect(mount(Boundary).get('p').text()).toBe('dict True');
});
