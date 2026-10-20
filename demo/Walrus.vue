<script lang="python">
    shown = False
    count = 0
    doc = {"title": "draft", "views": 0}
</script>

<template>
    <!-- Vue writes `@click="open = !open"` in every one of its examples. Python
         has no assignment expression except the walrus, and the walrus means
         exactly that: bind a name from inside an expression. -->
    <dl class="pairs handlers">
        <dt><code>shown := not shown</code></dt>
        <dd><button class="toggle" @click="shown := not shown">{{ shown }}</button></dd>

        <!-- A group, which returns its last value. -->
        <dt><code>count := count + 1, shown := True</code></dt>
        <dd><button class="both" @click="count := count + 1, shown := True">{{ count }}</button></dd>

        <!-- An attribute target and a key target, which Python's own grammar
             refuses the walrus and Vue's `=` accepts. -->
        <dt><code>doc.views := doc.views + 1</code></dt>
        <dd><button class="attr" @click="doc.views := doc.views + 1">{{ doc.views }}</button></dd>
        <dt><code>doc['title'] := 'reviewed'</code></dt>
        <dd><button class="key" @click="doc['title'] := 'reviewed'">{{ doc.title }}</button></dd>
    </dl>
</template>
