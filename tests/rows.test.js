import { test, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import Rows from '../demo/Rows.vue';

// The dot in a template finds an attribute, and failing that a key — Jinja's
// rule, and what anyone arriving from Django or Flask already expects. It holds
// for the length of one expression and nowhere else, so the script keeps
// Python's own meaning of the dot.
test('a dot on a dict finds a key', () => {
    expect(mount(Rows).findAll('li')[0].text()).toContain('lentils: 3');
});

// Attribute first, so a dict's real methods keep winning: `.items` is the
// method, not a key of that name. The rule costs a dict nothing it had.
test('and an attribute still wins over a key', () => {
    expect(mount(Rows).get('p').text()).toContain('4 — 2');
});

// A container held inside another one comes under the same watch, the first
// time Python reaches for it — which is necessarily just before it could be
// mutated. Nothing here is proxied, and no copy is made.
test('a nested container mutated in place still moves the page', async () => {
    const page = mount(Rows);

    expect(page.get('p').text()).toContain('4 — 2');

    await page.findAll('li')[0].get('button').trigger('click');

    expect(page.findAll('li')[0].text()).toContain('lentils: 4');
    expect(page.get('p').text()).toContain('5 — 2');
});
