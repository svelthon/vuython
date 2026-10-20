import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { toRaw, nextTick } from 'vue';

import Filters from '../demo/Filters.vue';
// A component of the test's own: `inspect` writes to the console, which the
// demo's page does not show and a green run does not say.
import Inspect from './Inspect.vue';

// The set Django and Jinja authors already know, under the words they search
// for — and the platform's behaviour behind each of them, which is the rule the
// whole set follows.
describe('the template helpers', () => {
    // Keeps every letter, digit and mark rather than folding to ASCII: keeping
    // `é` while keeping `本` is the only reading of "support unicode" that holds
    // together.
    test('slugify keeps unicode', () => {
        expect(mount(Filters).get('.slug').text()).toBe('café-society-summer-s-end-2026');
    });

    // Intl's four styles, in the reader's own language — which Django's format
    // letters never do.
    test('date answers in the language it is asked for', () => {
        expect(mount(Filters).get('.date').text()).toContain('September 8, 2026');
    });

    // `json.dumps` cannot stand in: Brython leaves a class instance untouched,
    // so the dump would walk the raw object. This is `to_js` with the dump
    // attached.
    test('tojson walks the Python out of the value', () => {
        expect(mount(Filters).get('.json').text()).toBe('{"name":"rice","price":2}');
    });

    // The browser's own parser, because nothing else does it correctly: the
    // regex Django and Jinja ship leaves `caf&eacute;` undecoded.
    test('striptags decodes what a regex would not', () => {
        expect(mount(Filters).get('.strip').text()).toBe('café au lait');
    });

    // Escaped in both forms, unlike Jinja, which yields `a/b` for a string and
    // `a%2Fb` for a mapping because the two reach different helpers.
    test('urlencode escapes the slash', () => {
        expect(mount(Filters).get('.url').text()).toBe('q=a%2Fb');
    });

    // A list of lists, not a lazy iterator: a `v-for` reads its rows again on
    // every update, and an iterator would come back empty the second time.
    test('batch groups rows, and pads the last one', () => {
        const rows = mount(Filters).findAll('tr');

        expect(rows.map((tr) => tr.text().replace(/\s+/g, ''))).toEqual(['12', '34', '50']);
    });
});

// Vue has no `$inspect`, so this is the whole of it: an effect that re-reads the
// values through the accessors and logs them. The values have to be read *again*
// on every change, which is why the arguments become a lambda rather than being
// handed over already read.
test('inspect logs, and re-reads on every change', async () => {
    const said = vi.spyOn(console, 'log').mockImplementation(() => {});
    const page = mount(Inspect);

    expect(said).toHaveBeenCalledWith('inspect', "Bonjour à Tous — l'été 2026");

    said.mockClear();
    toRaw(page.vm.$.setupState).titre = 'autre';
    await nextTick();

    expect(said).toHaveBeenCalledWith('inspect', 'autre');
    said.mockRestore();
});

describe('fromnow', () => {
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-08T12:00:30Z') }));
    afterEach(() => vi.useRealTimers());

    // One mount for both halves, on purpose: the clock is one object for the
    // whole page, so two mounts in two tests would share the timer it armed and
    // the second would be reading the first's.
    //
    // The first half: a *signed* gap, so the direction is in the value rather
    // than in the name — which is why this carries neither `timesince` nor
    // `timeuntil`.
    //
    // The second: the one helper here Django could not have had at all. A
    // rendered page is finished, so "3 minutes ago" is true once and then wrong.
    // A component stays on screen, and this one keeps itself right — asking for
    // exactly the delay the display needs, so it slows down on its own as a date
    // ages and nothing has to switch it off.
    test('formats a signed gap, and keeps itself right', async () => {
        const page = mount(Filters);

        expect(page.get('.since').text()).toBe('30 seconds ago');

        await vi.advanceTimersByTimeAsync(2000);

        expect(page.get('.since').text()).toBe('32 seconds ago');
    });
});
