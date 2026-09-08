import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Every line of Python is compiled at build time, so the compiler is dead
// weight in the bundle. The build aliases it away; these are the halves of what
// that swap has to be true for, checked on the file rather than on the claim.
//
// What comes out is the **parser** — `pegen` and the generated recursive-descent
// grammar, which are most of the weight — and not the whole of `ast_to_js`: nine
// of its functions are reachable at run time and stay. So `py2js` is still
// spelled in there, and testing for its absence would be testing the wrong
// thing. Measured before this test was written, on the two files themselves.
describe('the runtime-only Brython a build ships', () => {
    const runtime = readFileSync(resolve('vendor/brython_runtime.js'), 'utf8');
    const full = readFileSync(resolve('vendor/brython.js'), 'utf8');

    const count = (text, needle) => text.split(needle).length - 1;

    test('has no parser in it', () => {
        expect(count(full, 'Tokenizer')).toBeGreaterThan(0);
        expect(count(runtime, 'Tokenizer')).toBe(0);

        // `$B.parser` is the recursive-descent grammar, one function per rule.
        expect(count(runtime, '$B.parser')).toBeLessThan(count(full, '$B.parser') / 10);
    });

    // And what the generated code reaches for at run time. `namespace` above
    // all: it is the single call Vuython intercepts, and losing it would leave
    // a page with no reactivity and no error either.
    test('and keeps everything the generated code calls', () => {
        for (const name of [
            '$B.namespace=',
            '$B.call_attr=',
            '$B.$setitem=',
            '$B.$getitem=',
            '$B.delete_for_reassign=',
            '$B.jsobj2pyobj='
        ]) {
            expect(runtime, name).toContain(name);
        }
    });

    test('and is smaller for it', () => {
        expect(runtime.length).toBeLessThan(full.length * 0.7);
    });
});
