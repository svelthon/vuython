import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import Ticker from '../src/Ticker.vue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// `@effect` on both sides means the same thing: run after the DOM is patched,
// and again whenever something the body read has moved. Vue spells the flush
// `post` and hands the destructor an argument rather than reading a return
// value; the Python is unchanged.
describe('an effect', () => {
    test('runs after the DOM exists and re-runs on its own', async () => {
        const page = mount(Ticker);

        // A tick, because `on_mount` writes a name and the DOM it writes to has
        // already been rendered — which is what "after the DOM exists" means.
        await nextTick();

        expect(page.get('p').text()).toBe('0 tops toutes les 100 ms — monté : oui');

        await vi.advanceTimersByTimeAsync(250);

        expect(page.get('p').text()).toBe('2 tops toutes les 100 ms — monté : oui');
    });

    // Reading `step` inside the effect is the whole dependency: nothing declared
    // it, and nothing static could have found it.
    test('tears itself down and starts again when what it read has moved', async () => {
        const page = mount(Ticker);

        await vi.advanceTimersByTimeAsync(100);
        await page.get('button').trigger('click');
        await vi.advanceTimersByTimeAsync(100);

        // One tick at 100 ms, then two at 50 ms. Had the first interval
        // survived, there would be four.
        expect(page.get('p').text()).toBe('3 tops toutes les 50 ms — monté : oui');
    });

    test('and stops when the component goes away', async () => {
        const page = mount(Ticker);

        await vi.advanceTimersByTimeAsync(100);
        page.unmount();
        await vi.advanceTimersByTimeAsync(1000);

        expect(vi.getTimerCount()).toBe(0);
    });
});

// A convention rather than an import, which is what Svelthon does too: a `def`
// of that name is wired to the framework's own hook.
test('on_mount runs once, after the first render', async () => {
    const page = mount(Ticker);

    expect(page.get('p').text()).toContain('monté :');

    await nextTick();

    expect(page.get('p').text()).toContain('monté : oui');
});
