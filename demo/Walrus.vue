<script lang="python">
    ouvert = False
    compte = 0
    fiche = {"titre": "brouillon", "vues": 0}
</script>

<template>
    <!-- Vue writes `@click="open = !open"` in every one of its examples. Python
         has no assignment expression except the walrus, and the walrus means
         exactly that: bind a name from inside an expression. -->
    <button class="bascule" @click="ouvert := not ouvert">{{ ouvert }}</button>

    <!-- A group, which returns its last value. -->
    <button class="deux" @click="compte := compte + 1, ouvert := True">{{ compte }}</button>

    <!-- An attribute target and a key target, which Python's own grammar
         refuses the walrus and Vue's `=` accepts. -->
    <button class="champ" @click="fiche.vues := fiche.vues + 1">{{ fiche.vues }}</button>
    <button class="cle" @click="fiche['titre'] := 'relu'">{{ fiche.titre }}</button>
</template>
