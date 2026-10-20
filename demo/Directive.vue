<script lang="python">
    color = "gold"
    visible = True
    trace = []

    # `@directive` makes a `v-` name out of a def. The contract is Svelte's
    # action, which is the one a reader arriving from Svelthon knows: called with
    # the node and the value, called again when the value moves, and whatever it
    # returns is its destructor.
    @directive
    def highlight(node, value):
        node.style.backgroundColor = value
        trace.append(f"set {value}")

        def remove():
            trace.append("unset")

        return remove

    def recolor():
        global color
        color = "deepskyblue" if color == "gold" else "gold"

    def hide():
        global visible
        visible = not visible
</script>

<template>
    <p v-if="visible" v-highlight="color" class="target">highlighted</p>
    <button class="color" @click="recolor()">change</button>
    <button class="hide" @click="hide()">hide</button>

    <!-- `trace` is deliberately *not* rendered. A directive runs while Vue is
         patching, so writing a name the template reads would invalidate the
         render that is running — the same loop an effect makes when it writes
         what it read, and Vue names it out loud. -->

</template>
