<script lang="python">
    # A callable rather than the value: context is read once, when the child
    # initialises, so what has to cross is a way of reading — the same shape
    # Vue's own docs recommend for a provided value that changes.
    read = inject("color", lambda: "none")

    color => read()
</script>

<template>
    <p class="badge">{{ color }}</p>
</template>
