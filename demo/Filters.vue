<script lang="python">
    title = "Café Society — Summer's End 2026"
    when = "2026-09-08T12:00:00Z"
    numbers = [1, 2, 3, 4, 5]
    item = {"name": "rice", "price": 2}
    html = "<p>caf&eacute; <b>au lait</b></p>"
</script>

<template>
    <dl class="pairs">
        <dt>slugify</dt>
        <dd class="slug">{{ slugify(title) }}</dd>
        <dt>date</dt>
        <dd class="date">{{ date(when, "long", None, "en-US") }}</dd>
        <dt>fromnow</dt>
        <dd class="since">{{ fromnow(when, "en-US") }}</dd>
        <dt>tojson</dt>
        <dd class="json">{{ tojson(item) }}</dd>
        <dt>striptags</dt>
        <dd class="strip">{{ striptags(html) }}</dd>
        <dt>urlencode</dt>
        <dd class="url">{{ urlencode({"q": "a/b"}) }}</dd>
        <dt>batch</dt>
        <dd>
            <table class="batch">
                <tr v-for="row in batch(numbers, 2, 0)" :key="row[0]">
                    <td v-for="cell in row" :key="cell">{{ cell }}</td>
                </tr>
            </table>
        </dd>
    </dl>
</template>
