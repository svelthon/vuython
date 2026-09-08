<script lang="python">
    couleur = "gold"
    visible = True
    trace = []

    # `@directive` makes a `v-` name out of a def. The contract is Svelte's
    # action, which is the one a reader arriving from Svelthon knows: called with
    # the node and the value, called again when the value moves, and whatever it
    # returns is its destructor.
    @directive
    def surligne(node, valeur):
        node.style.backgroundColor = valeur
        trace.append(f"pose {valeur}")

        def enleve():
            trace.append("retire")

        return enleve

    def basculer():
        global couleur
        couleur = "deepskyblue" if couleur == "gold" else "gold"

    def cacher():
        global visible
        visible = not visible
</script>

<template>
    <p v-if="visible" v-surligne="couleur" class="cible">surligné</p>
    <button class="couleur" @click="basculer()">changer</button>
    <button class="cacher" @click="cacher()">cacher</button>

    <!-- `trace` is deliberately *not* rendered. A directive runs while Vue is
         patching, so writing a name the template reads would invalidate the
         render that is running — the same loop an effect makes when it writes
         what it read, and Vue names it out loud. -->

</template>
