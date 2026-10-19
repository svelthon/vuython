<script lang="python">
    importjs Panier from "./Panier.vue"

    # The very same refs the other component reads: one module, one state, for
    # the whole application.
    import panier

    catalogue = [("lentilles", 3), ("riz", 2)]
</script>

<template>
    <!-- `[nom, prix]` and not `(nom, prix)`: Vue's parenthesised alias means
         (value, index), so the second name would be the row number. A Python
         tuple is a JavaScript array, so array destructuring unpacks it. -->
    <button v-for="[nom, prix] in catalogue" :key="nom" @click="panier.ajouter(nom, prix)">
        {{ nom }} — {{ prix }} euros
    </button>

    <Panier />
</template>
