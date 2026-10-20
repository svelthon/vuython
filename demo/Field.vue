<script lang="python">
    # `<=>` is a prop that travels back up. Under Vue that is a prop plus an
    # `update:value` event, which is exactly what `v-model:value` binds to.
    value: str <=> ""

    def clear():
        global value
        value = ""
</script>

<template>
    <div class="row">
        <input v-model="value" placeholder="type here">
        <button @click="clear()">clear</button>
    </div>
</template>
