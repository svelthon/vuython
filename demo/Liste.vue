<script lang="python">
    importjs Carte from "./Carte.vue"

    rangs = [{"id": 7, "nom": "sel"}, {"id": 8, "nom": "poivre"}]

    coches = []
    choix = "a"
</script>

<template>
    <Carte titre="courses">
        <!-- The slot props are Python names inside the block, exactly as a
             v-for alias is. -->
        <template #ligne="{ donnee, rang }">
            <b class="ligne">{{ rang }} — {{ donnee.nom.upper() }}</b>
        </template>

        <p class="defaut">{{ len(rangs) }} en réserve</p>
    </Carte>

    <!-- `{ id, nom }` destructures a Brython dict: its keys are ordinary
         JavaScript properties, so Vue's own destructuring reaches them. -->
    <p v-for="{ id, nom } in rangs" :key="id" class="destructure">{{ id }}:{{ nom }}</p>

    <!-- v-model over an array, which is Svelte's `bind:group`. Nothing here is
         ours: the name is a property of the object setup() returned. -->
    <input type="checkbox" value="riz" v-model="coches">
    <input type="checkbox" value="sel" v-model="coches">
    <p class="coches">{{ coches }}</p>

    <!-- What the directive wrote has to be a real list, not a JavaScript array
         wearing the name: `.append` is the test that tells them apart. -->
    <button class="ajoute" @click="coches.append('poivre')">ajouter</button>

    <input type="radio" value="a" v-model="choix">
    <input type="radio" value="b" v-model="choix">
    <p class="choix">{{ choix }}</p>
</template>
