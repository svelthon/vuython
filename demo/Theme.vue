<script lang="python">
    importjs Badge from "./Badge.vue"

    couleur = "vert"

    # Context is per component subtree. Both halves are called while the
    # instance initialises, which is exactly when this module body runs.
    provide("couleur", lambda: couleur)

    def basculer():
        global couleur
        couleur = "rouge" if couleur == "vert" else "vert"
</script>

<template>
    <button @click="basculer()">basculer</button>
    <Badge />
</template>
