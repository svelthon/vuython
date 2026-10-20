<script lang="python">
    importjs Badge from "./Badge.vue"

    color = "green"

    # Context is per component subtree. Both halves are called while the
    # instance initialises, which is exactly when this module body runs.
    provide("color", lambda: color)

    def toggle():
        global color
        color = "red" if color == "green" else "green"
</script>

<template>
    <div class="row">
        <button @click="toggle()">toggle</button>
        <Badge />
    </div>
</template>
