<script lang="python">
import boundary

row = {"name": "riz"}
kind = boundary.describe(row)
boundary.mark(row)
</script>

<template>
    <p>{{ kind }} {{ row.get("seen") }}</p>
</template>
