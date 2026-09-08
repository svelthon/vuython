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
    importjs Boutique from "./Boutique.vue"
    importjs Theme from "./Theme.vue"
    importjs Walrus from "./Walrus.vue"
    importjs Filtres from "./Filtres.vue"
    importjs Liste from "./Liste.vue"

    qui = "Florent"
    cherche = ""
</script>

<template>
    <h1>Vuython</h1>
    <p class="sub">Des composants Vue écrits en Python, compilés par Brython au build.</p>

    <section>
        <h2>Un prop</h2>
        <Greeting :name="qui" :excited="True" />
        <input v-model="qui">
    </section>

    <section>
        <h2>Une liste que l'on modifie sur place</h2>
        <Notes />
    </section>

    <section>
        <h2>Le point qui trouve une clé</h2>
        <Rows />
    </section>

    <section>
        <h2>Un prop qui remonte</h2>
        <Field v-model:value="cherche" />
        <p>le parent lit : « {{ cherche }} »</p>
    </section>

    <section>
        <h2>Un module partagé</h2>
        <Boutique />
    </section>

    <section>
        <h2>Un contexte</h2>
        <Theme />
    </section>

    <section>
        <h2>Le morse dans un gestionnaire</h2>
        <Walrus />
    </section>

    <section>
        <h2>Une slot, un groupe, un dépaquetage</h2>
        <Liste />
    </section>

    <section>
        <h2>Les filtres</h2>
        <Filtres />
    </section>

    <section>
        <h2>Un effet</h2>
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
