<script lang="python">
    shown = False
    count = 0
    doc = {"title": "draft", "views": 0}
</script>

<template>
    <!-- Vue writes `@click="open = !open"` in every one of its examples. Python
         has no assignment expression except the walrus, and the walrus means
         exactly that: bind a name from inside an expression. -->
    <button class="toggle" @click="shown := not shown">{{ shown }}</button>

    <!-- A group, which returns its last value. -->
    <button class="both" @click="count := count + 1, shown := True">{{ count }}</button>

    <!-- An attribute target and a key target, which Python's own grammar
         refuses the walrus and Vue's `=` accepts. -->
    <button class="attr" @click="doc.views := doc.views + 1">{{ doc.views }}</button>
    <button class="key" @click="doc['title'] := 'reviewed'">{{ doc.title }}</button>
</template>
