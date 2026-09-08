<script lang="python">
    # The child components are registered on the application in main.js. A
    # Python `import` cannot name a .vue file, and the PoC has no `importjs`
    # yet — global registration is ordinary Vue and costs the demo nothing.
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
        <h2>Un prop qui remonte</h2>
        <Field v-model:value="cherche" />
        <p>le parent lit : « {{ cherche }} »</p>
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
</style>
