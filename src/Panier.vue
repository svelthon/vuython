<script lang="python">
    # `import panier`, not `from panier import lignes`. Python's own rule, and
    # it bites the same way in CPython: `from x import y` binds `y` once, so the
    # component would hold whatever the name meant at import time and never see
    # it move again. Reaching through the module keeps the read live.
    import panier
</script>

<template>
    <p class="resume">{{ panier.resume }}</p>
    <li v-for="ligne in panier.lignes" :key="ligne.nom">{{ ligne.nom }}</li>
    <button class="vider" @click="panier.vider()">vider</button>
</template>
