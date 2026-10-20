<script lang="python">
    # `import cart`, not `from cart import lines`. Python's own rule, and it
    # bites the same way in CPython: `from x import y` binds `y` once, so the
    # component would hold whatever the name meant at import time and never see
    # it move again. Reaching through the module keeps the read live.
    import cart
</script>

<template>
    <p class="summary">{{ cart.summary }}</p>
    <ul class="lines">
        <li v-for="line in cart.lines" :key="line.name">{{ line.name }}</li>
    </ul>
    <button class="empty" @click="cart.empty()">empty</button>
</template>
