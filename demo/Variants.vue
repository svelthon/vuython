<script lang="python">
    count = 0

    # Each effect copies `count` into a name no effect reads. An effect that
    # wrote a name it had also read would invalidate itself, and Vue says so by
    # name: "a reactive effect that is mutating its own dependencies".
    seen_before = -1
    seen_after = -1
    seen_owned = -1

    # Vue's default flush is `pre`, which runs before the DOM is patched; a
    # plain effect asks for `post`, which runs after. The same split Svelte
    # spells `$effect` and `$effect.pre`.
    @effect.pre
    def before():
        global seen_before
        seen_before = count

    @effect
    def after():
        global seen_after
        seen_after = count

    # A root makes a scope of its own, and the decorated name reads as its
    # stopper — `effectScope()` under Vue, `$effect.root` under Svelte.
    @effect.root
    def owned():
        global seen_owned
        seen_owned = count

    def bump():
        global count
        count += 1

    def stop():
        owned()
</script>

<template>
    <p>{{ count }} : {{ seen_before }} {{ seen_after }} {{ seen_owned }}</p>
    <button class="bump" @click="bump()">plus one</button>
    <button class="stop" @click="stop()">stop</button>
</template>
