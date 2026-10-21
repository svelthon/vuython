<script lang="python">
    # A JavaScript import, written where the Python is. The keyword announces
    # that what follows is JavaScript's own clause, so there is nothing new to
    # learn — and a default import is also a component registration, because Vue
    # resolves `<Notes />` through the `components` option.
    importjs Notes from "./Notes.vue"
    importjs Greeting from "./Greeting.vue"
    importjs Ticker from "./Ticker.vue"
    importjs Field from "./Field.vue"
    importjs Rows from "./Rows.vue"
    importjs Shop from "./Shop.vue"
    importjs Theme from "./Theme.vue"
    importjs Walrus from "./Walrus.vue"
    importjs Filters from "./Filters.vue"
    importjs Groceries from "./Groceries.vue"

    who = "Ada"
    search = ""
</script>

<template>
    <header class="hero">
        <p class="eyebrow">Vuython</p>
        <h1><span class="vue">Vue</span> components in <span class="python">Python</span></h1>
        <p class="lead">
            A demo of integrating Bryntime and Brycomp into Vue, independent of Svelthon. Every
            component on this page is written in Python and compiled by Brython at build time:
            the browser receives only JavaScript.
        </p>
    </header>

    <main class="grid">
        <section class="card">
            <h2>A prop</h2>
            <p class="what"><code>name: str = "world"</code> declares a prop and its default; the parent's Python name fills it.</p>
            <div class="demo">
                <Greeting :name="who" :excited="True" />
                <input v-model="who" aria-label="name">
            </div>
        </section>

        <section class="card">
            <h2>A list changed in place</h2>
            <p class="what"><code>notes.append(n)</code>: no copy, no reassignment, and the average follows.</p>
            <div class="demo">
                <Notes />
            </div>
        </section>

        <section class="card">
            <h2>The dot that finds a key</h2>
            <p class="what"><code>row.label</code> on a dict reads its key, and the dict's own methods still win.</p>
            <div class="demo">
                <Rows />
            </div>
        </section>

        <section class="card">
            <h2>A prop that travels back up</h2>
            <p class="what"><code>value: str &lt;=&gt; ""</code> is a prop plus its update event, which <code>v-model:value</code> binds.</p>
            <div class="demo">
                <Field v-model:value="search" />
                <p class="echo">the parent reads: “{{ search }}”</p>
            </div>
        </section>

        <section class="card">
            <h2>A shared module</h2>
            <p class="what"><code>import cart</code>: one <code>.py</code>, one state for the whole application.</p>
            <div class="demo">
                <Shop />
            </div>
        </section>

        <section class="card">
            <h2>A context</h2>
            <p class="what"><code>provide()</code> above, <code>inject()</code> below, spelled the Python way.</p>
            <div class="demo">
                <Theme />
            </div>
        </section>

        <section class="card">
            <h2>The walrus in a handler</h2>
            <p class="what"><code>shown := not shown</code> on a click: Python's own assignment expression, where Vue writes <code>=</code>.</p>
            <div class="demo">
                <Walrus />
            </div>
        </section>

        <section class="card">
            <h2>A slot, a group, an unpacking</h2>
            <p class="what">Scoped slot props are Python names, and <code>v-model</code> over checkboxes fills a real list.</p>
            <div class="demo">
                <Groceries />
            </div>
        </section>

        <section class="card">
            <h2>The filters</h2>
            <p class="what">The helpers a Django or Jinja author already reaches for.</p>
            <div class="demo">
                <Filters />
            </div>
        </section>

        <section class="card">
            <h2>An effect</h2>
            <p class="what"><code>@effect</code> returns its own destructor, and a faster step restarts the interval.</p>
            <div class="demo">
                <Ticker />
            </div>
        </section>
    </main>

    <footer>
        Built on <a href="https://www.npmjs.com/package/bryntime">Bryntime</a>, the Brython
        runtime for JavaScript frameworks, and on <a href="https://www.npmjs.com/package/brycomp">Brycomp</a>,
        the Brython compiler for JavaScript frameworks.
    </footer>
</template>

<style>
    :root {
        --bg: #f5f7f6;
        --fg: #1d2622;
        --muted: #5d6b65;
        --card: #ffffff;
        --line: #e1e7e4;
        --accent: #42b883;
        --ink: #23795a;
        --soft: #eaf6f0;
        --python: #3776ab;
        color-scheme: light dark;
    }

    @media (prefers-color-scheme: dark) {
        :root {
            --bg: #0f1513;
            --fg: #e4ebe8;
            --muted: #94a39c;
            --card: #161e1b;
            --line: #26312d;
            --ink: #7fd3ab;
            --soft: #1b2a24;
            --python: #7fb3e0;
        }
    }

    * { box-sizing: border-box; }

    body {
        margin: 0;
        background: var(--bg);
        color: var(--fg);
        font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }

    #app { max-width: 72rem; margin: 0 auto; padding: 3.5rem 1.25rem 3rem; }

    a { color: var(--ink); }

    .hero { margin-bottom: 2.75rem; }
    .eyebrow {
        margin: 0;
        color: var(--ink);
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
    }
    .hero h1 { margin: 0.35rem 0 0.9rem; font-size: clamp(2rem, 5vw, 3.1rem); line-height: 1.1; }
    .hero h1 .vue { color: var(--accent); }
    .hero h1 .python { color: var(--python); }
    .lead { max-width: 46rem; margin: 0; color: var(--muted); font-size: 1.05rem; }

    .grid { columns: 21rem 3; column-gap: 1.25rem; }

    .card {
        break-inside: avoid;
        width: 100%;
        margin: 0 0 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        padding: 1.25rem 1.3rem 1.4rem;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 14px;
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
    }
    .card h2 { margin: 0; font-size: 1.05rem; }
    .what { margin: 0; color: var(--muted); font-size: 0.9rem; }

    code {
        padding: 0.1em 0.35em;
        background: var(--soft);
        color: var(--ink);
        border-radius: 5px;
        font: 0.84em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .demo {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.65rem;
        padding-top: 0.95rem;
        border-top: 1px dashed var(--line);
    }
    .demo p, .demo h3, .demo ul, .demo dl { margin: 0; }
    .demo h3 { font-size: 0.95rem; }
    .demo ul { padding: 0; list-style: none; }
    .demo ul.lines { display: flex; flex-direction: column; gap: 0.35rem; }
    .demo ul.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .chips li {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.15rem 0.3rem 0.15rem 0.75rem;
        background: var(--soft);
        border-radius: 999px;
    }
    .chips li button { padding: 0 0.45rem; border: none; border-radius: 999px; }

    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .row label { display: inline-flex; align-items: center; gap: 0.3rem; }

    button {
        padding: 0.3rem 0.8rem;
        background: transparent;
        color: var(--ink);
        border: 1px solid var(--accent);
        border-radius: 8px;
        font: inherit;
        font-size: 0.9rem;
        white-space: nowrap;
        cursor: pointer;
        transition: background 0.12s, color 0.12s;
    }
    button:hover { background: var(--accent); color: #fff; }
    button:disabled, button:disabled:hover { opacity: 0.45; background: transparent; color: var(--ink); cursor: default; }

    input:not([type="checkbox"]):not([type="radio"]) {
        min-width: 0;
        padding: 0.35rem 0.6rem;
        background: var(--bg);
        color: var(--fg);
        border: 1px solid var(--line);
        border-radius: 8px;
        font: inherit;
    }
    input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

    .greeting { font-size: 1.45rem; font-weight: 650; }
    .result { font-weight: 600; }
    .echo { color: var(--muted); }

    .badge { padding: 0.15rem 0.75rem; border-radius: 999px; background: var(--muted); color: #fff; font-weight: 600; }
    .badge[data-color="green"] { background: #2f9e6e; }
    .badge[data-color="red"] { background: #d64545; }

    dl.pairs {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        align-items: center;
        gap: 0.4rem 0.9rem;
        width: 100%;
        font-size: 0.9rem;
    }
    dl.pairs dt { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    dl.pairs dt code { background: none; padding: 0; color: inherit; }
    dl.pairs dd { margin: 0; overflow-wrap: anywhere; }
    dl.handlers { grid-template-columns: minmax(0, 1fr) max-content; }
    dl.handlers dt { overflow-wrap: anywhere; }
    table.batch { border-collapse: collapse; }
    table.batch td { min-width: 1.8rem; padding: 0.1rem 0.5rem; border: 1px solid var(--line); text-align: center; }

    footer { margin-top: 3rem; color: var(--muted); font-size: 0.9rem; text-align: center; }
</style>
