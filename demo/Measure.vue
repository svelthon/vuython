<script lang="python">
    import measures

    # Vue's `useId()`: stable across server and client, so hydration does not
    # object, and unique per instance so two of these on one page do not collide.
    field = props_id()
</script>

<template>
    <label :for="field">measure</label>
    <input :id="field">
    <p class="round-trip">{{ measures.round_trip(9) }}</p>
    <button class="add" @click="measures.add(3)">add</button>
    <p class="total">{{ measures.total }}</p>
</template>
