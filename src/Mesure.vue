<script lang="python">
    import mesures

    # Vue's `useId()`: stable across server and client, so hydration does not
    # object, and unique per instance so two of these on one page do not collide.
    champ = props_id()
</script>

<template>
    <label :for="champ">mesure</label>
    <input :id="champ">
    <p class="moitie">{{ mesures.moitie(9) }}</p>
    <button class="ajoute" @click="mesures.ajouter(3)">ajouter</button>
    <p class="total">{{ mesures.total }}</p>
</template>
