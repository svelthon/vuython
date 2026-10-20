<script lang="python">
    from browser import document

    text = ""

    # `@export` is what Vue writes as `defineExpose`: the one way out of a
    # component that is neither a prop nor an event. A parent holding a ref to
    # this instance can call it.
    @export
    def fill(value):
        global text
        text = value

    # The call form, for a body that fits on one line.
    clear = export(lambda: fill(""))
</script>

<template>
    <p class="text">{{ text }}</p>
</template>
