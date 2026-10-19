<script lang="python">
    # `<=>` is a prop that travels back up. Under Vue that is a prop plus an
    # `update:value` event, which is exactly what `v-model:value` binds to.
    value: str <=> ""

    def clear():
        global value
        value = ""
</script>

<template>
    <input v-model="value">
    <button @click="clear()">effacer</button>
</template>
