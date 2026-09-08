// Initialise the runtime once per page. `ipy_id: []` keeps brython() from
// scanning the document for <script type="text/python"> — Vuython components
// are already compiled, there is nothing left to find.
const $B = globalThis.__BRYTHON__;

// globals.js shadowed `process` so that brython.js would see the DOM jsdom
// provides rather than the Node process behind it. Its load is over.
if ($B.$vuythonRealProcess) {
    globalThis.process = $B.$vuythonRealProcess;
    delete $B.$vuythonRealProcess;
}

// What brython.js adds to the global scope when it finds no browser.
const DOM_STUBS = new Set(['document', 'location', 'HTMLElement', 'MutationObserver', 'customElements']);

if (!$B.$vuython_booted) {
    $B.$vuython_booted = true;
    $B.brython({ ipy_id: [] });

    // Server rendering must look like server rendering. Brython's DOM stubs did
    // their job during the bootstrap above; leaving them in place makes every
    // library that tests `typeof document` take the browser path and fail on
    // `window`.
    const before = $B.$vuythonGlobalsBefore;

    if (before && !before.has('window')) {
        for (const name of Object.getOwnPropertyNames(globalThis)) {
            if (!before.has(name) && DOM_STUBS.has(name)) delete globalThis[name];
        }
    }
}
