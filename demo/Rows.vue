<script lang="python">
    rows = [
        {"label": "lentilles", "qty": 3},
        {"label": "riz", "qty": 1},
    ]

    total => sum(r["qty"] for r in rows)

    def add(row):
        row["qty"] += 1
</script>

<template>
    <!-- `row.label` on a dict: an attribute first, then a key. The shape of your
         data should not dictate the shape of your markup. -->
    <li v-for="row in rows" :key="row.label">
        {{ row.label }} : {{ row.qty }}
        <button @click="add(row)">+</button>
    </li>

    <!-- And the attribute really does win: `.items` is the dict's own method,
         not a key of that name, so a dict's methods are never shadowed. -->
    <p>{{ total }} — {{ len(list(rows[0].items())) }}</p>
</template>
