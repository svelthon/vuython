<script lang="python">
    importjs Cart from "./Cart.vue"

    # The very same refs the other component reads: one module, one state, for
    # the whole application.
    import cart

    catalog = [("lentils", 3), ("rice", 2)]
</script>

<template>
    <!-- `[name, price]` and not `(name, price)`: Vue's parenthesised alias means
         (value, index), so the second name would be the row number. A Python
         tuple is a JavaScript array, so array destructuring unpacks it. -->
    <button v-for="[name, price] in catalog" :key="name" @click="cart.add(name, price)">
        {{ name }}, €{{ price }}
    </button>

    <Cart />
</template>
