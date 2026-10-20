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
    <h1>Vuython</h1>
    <p class="sub">Vue components written in Python, compiled by Brython at build time.</p>

    <section>
        <h2>A prop</h2>
        <Greeting :name="who" :excited="True" />
        <input v-model="who">
    </section>

    <section>
        <h2>A list changed in place</h2>
        <Notes />
    </section>

    <section>
        <h2>The dot that finds a key</h2>
        <Rows />
    </section>

    <section>
        <h2>A prop that travels back up</h2>
        <Field v-model:value="search" />
        <p>the parent reads: “{{ search }}”</p>
    </section>

    <section>
        <h2>A shared module</h2>
        <Shop />
    </section>

    <section>
        <h2>A context</h2>
        <Theme />
    </section>

    <section>
        <h2>The walrus in a handler</h2>
        <Walrus />
    </section>

    <section>
        <h2>A slot, a group, an unpacking</h2>
        <Groceries />
    </section>

    <section>
        <h2>The filters</h2>
        <Filters />
    </section>

    <section>
        <h2>An effect</h2>
        <Ticker />
    </section>
</template>

<style>
    body { font: 16px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 42rem; }
    h1 { margin-bottom: 0; }
    .sub { color: #666; margin-top: 0.2rem; }
    section { border-top: 1px solid #ddd; padding-top: 0.5rem; margin-top: 1.5rem; }
    input, button { font: inherit; }
    td { border: 1px solid #ccc; padding: 0 0.4rem; }
</style>
