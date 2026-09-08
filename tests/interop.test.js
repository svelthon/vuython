import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';

import Interop from '../src/Interop.vue';
import App from '../src/App.vue';

// The commonest importjs of all is a child component — 25 of the 65 imports
// measured across the Svelthon projects. Under Svelte that is a lexical binding
// the compiler resolves; under Vue it has to reach the `components` option, or
// `resolveComponent` finds nothing and the tag renders as an unknown element.
test('a default import registers a child component', () => {
    expect(mount(App).html()).toContain('moyenne : 11.7');
});

describe('a JavaScript name reached from Python', () => {
    test('is callable, and the arguments cross as Python', () => {
        expect(mount(Interop).get('.a').text()).toBe('BONJOUR !');
    });

    // The other direction: a Python callable handed to JavaScript, which cannot
    // use one as it stands — it refuses arguments it never declared and answers
    // in Python objects.
    test('and a Python callable handed back to it survives the trip', () => {
        expect(mount(Interop).get('.b').text()).toBe('<x> <x>');
    });

    // Without the inbound half, `half(9)` arrives as a raw JavaScript number and
    // `* 2` raises JavascriptError.
    test('and what it answers is Python, not a JavaScript value', () => {
        expect(mount(Interop).get('.c').text()).toBe('9.0');
    });

    test('under every clause the keyword accepts', () => {
        expect(mount(Interop).get('.d').text()).toBe('default:x / Y !');
    });
});
