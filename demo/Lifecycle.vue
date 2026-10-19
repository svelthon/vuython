<script lang="python">
    log = []
    width = 3

    # The decorator form of the arrow: same meaning, a body instead of one line.
    @derived
    def bar():
        return "#" * width

    def wider():
        global width
        width += 1

    def on_mount():
        log.append("mount")

    def on_destroy():
        log.append("destroy")
</script>

<template>
    <p>{{ bar }}</p>
    <button @click="wider()">plus large</button>
</template>
