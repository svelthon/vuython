<script lang="python">
    from browser import window

    step = 100
    ticks = 0
    mounted = ""

    # An effect runs after the DOM has been patched, and again whenever
    # something it read has moved — here `step`, so pressing the button tears
    # the old interval down and starts a new one.
    #
    # What the effect returns is its destructor. Vue passes `onCleanup` as an
    # argument instead of reading a return value, so the generated code makes
    # the two agree; the Python reads exactly as it does under Svelte.
    @effect
    def every():
        handle = window.setInterval(bump, step)
        return lambda: window.clearInterval(handle)

    def bump():
        global ticks
        ticks += 1

    def faster():
        global step
        step = step // 2

    def on_mount():
        global mounted
        mounted = "yes"
</script>

<template>
    <p class="result">{{ ticks }} ticks every {{ step }} ms, mounted: {{ mounted }}</p>
    <button @click="faster()">faster</button>
</template>
