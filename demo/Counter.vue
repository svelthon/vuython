<script lang="python">
    count = 0

    doubled => count * 2

    def increment():
        global count
        count += 1
</script>

<template>
    <p>{{ count }} / {{ doubled }}</p>
    <button @click="increment()">plus one</button>
</template>
