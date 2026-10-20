<script lang="python">
    title = "Café Society — Summer's End 2026"
    when = "2026-09-08T12:00:00Z"
    numbers = [1, 2, 3, 4, 5]
    item = {"name": "rice", "price": 2}
    html = "<p>caf&eacute; <b>au lait</b></p>"
</script>

<template>
    <p class="slug">{{ slugify(title) }}</p>
    <p class="date">{{ date(when, "long", None, "en-US") }}</p>
    <p class="json">{{ tojson(item) }}</p>
    <p class="strip">{{ striptags(html) }}</p>
    <p class="url">{{ urlencode({"q": "a/b"}) }}</p>
    <tr v-for="row in batch(numbers, 2, 0)" :key="row[0]">
        <td v-for="cell in row" :key="cell">{{ cell }}</td>
    </tr>
    <p class="since">{{ fromnow(when, "en-US") }}</p>
</template>
