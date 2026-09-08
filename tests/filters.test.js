import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { toRaw, nextTick } from 'vue';

import Filtres from '../src/Filtres.vue';

// The set Django and Jinja authors already know, under the words they search
// for — and the platform's behaviour behind each of them, which is the rule the
// whole set follows.
describe('the template helpers', () => {
    // Keeps every letter, digit and mark rather than folding to ASCII: keeping
    // `é` while keeping `本` is the only reading of "support unicode" that holds
    // together.
    test('slugify keeps unicode', () => {
        expect(mount(Filtres).get('.slug').text()).toBe('bonjour-à-tous-l-été-2026');
    });

    // Intl's four styles, in the reader's own language — which Django's format
    // letters never do.
    test('date answers in the language it is asked for', () => {
        expect(mount(Filtres).get('.date').text()).toContain('septembre 2026');
    });

    // `json.dumps` cannot stand in: Brython leaves a class instance untouched,
    // so the dump would walk the raw object. This is `to_js` with the dump
    // attached.
    test('tojson walks the Python out of the value', () => {
        expect(mount(Filtres).get('.json').text()).toBe('{"nom":"riz","prix":2}');
    });

    // The browser's own parser, because nothing else does it correctly: the
    // regex Django and Jinja ship leaves `caf&eacute;` undecoded.
    test('striptags decodes what a regex would not', () => {
        expect(mount(Filtres).get('.strip').text()).toBe('café noir');
    });

    // Escaped in both forms, unlike Jinja, which yields `a/b` for a string and
    // `a%2Fb` for a mapping because the two reach different helpers.
    test('urlencode escapes the slash', () => {
        expect(mount(Filtres).get('.url').text()).toBe('q=a%2Fb');
    });

    // A list of lists, not a lazy iterator: a `v-for` reads its rows again on
    // every update, and an iterator would come back empty the second time.
    test('batch groups rows, and pads the last one', () => {
        const rows = mount(Filtres).findAll('tr');

        expect(rows.map((tr) => tr.text().replace(/\s+/g, ''))).toEqual(['12', '34', '50']);
    });
});

// Vue has no `$inspect`, so this is the whole of it: an effect that re-reads the
// values through the accessors and logs them. The values have to be read *again*
// on every change, which is why the arguments become a lambda rather than being
// handed over already read.
test('inspect logs, and re-reads on every change', async () => {
    const said = vi.spyOn(console, 'log').mockImplementation(() => {});
    const page = mount(Filtres);

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
        const page = mount(Filtres);

        expect(page.get('.depuis').text()).toBe('il y a 30 secondes');

        await vi.advanceTimersByTimeAsync(2000);

        expect(page.get('.depuis').text()).toBe('il y a 32 secondes');
    });
});
