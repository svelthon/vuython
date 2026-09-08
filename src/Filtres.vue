<script lang="python">
    titre = "Bonjour à Tous — l'été 2026"
    quand = "2026-09-08T12:00:00Z"
    lignes = [1, 2, 3, 4, 5]
    fiche = {"nom": "riz", "prix": 2}
    html = "<p>caf&eacute; <b>noir</b></p>"

    # A console.log that re-runs on its own, and that a production build drops.
    inspect(titre)
</script>

<template>
    <p class="slug">{{ slugify(titre) }}</p>
    <p class="date">{{ date(quand, "long", None, "fr-FR") }}</p>
    <p class="json">{{ tojson(fiche) }}</p>
    <p class="strip">{{ striptags(html) }}</p>
    <p class="url">{{ urlencode({"q": "a/b"}) }}</p>
    <tr v-for="rangee in batch(lignes, 2, 0)" :key="rangee[0]">
        <td v-for="cellule in rangee" :key="cellule">{{ cellule }}</td>
    </tr>
    <p class="depuis">{{ fromnow(quand, "fr-FR") }}</p>
</template>
