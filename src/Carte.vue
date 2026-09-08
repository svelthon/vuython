<script lang="python">
    titre: str = "sans titre"

    lignes = [{"id": 1, "nom": "riz"}, {"id": 2, "nom": "lentilles"}]
</script>

<template>
    <h3>{{ titre }}</h3>

    <!-- A scoped slot: the parent writes the markup, this component supplies
         the row. Vue's own machinery, untouched — all the walker does is put
         the slot's names in scope for the expressions inside it. -->
    <ul>
        <li v-for="ligne in lignes" :key="ligne.id">
            <slot name="ligne" :donnee="ligne" :rang="ligne.id">{{ ligne.nom }}</slot>
        </li>
    </ul>

    <slot></slot>
</template>
