<script lang="python">
    title: str = "untitled"

    rows = [{"id": 1, "name": "rice"}, {"id": 2, "name": "lentils"}]
</script>

<template>
    <h3>{{ title }}</h3>

    <!-- A scoped slot: the parent writes the markup, this component supplies
         the row. Vue's own machinery, untouched — all the walker does is put
         the slot's names in scope for the expressions inside it. -->
    <ul>
        <li v-for="row in rows" :key="row.id">
            <slot name="row" :item="row" :rank="row.id">{{ row.name }}</slot>
        </li>
    </ul>

    <slot></slot>
</template>
