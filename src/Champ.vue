<script lang="python">
    from browser import document

    texte = ""

    # `@export` is what Vue writes as `defineExpose`: the one way out of a
    # component that is neither a prop nor an event. A parent holding a ref to
    # this instance can call it.
    @export
    def remplir(valeur):
        global texte
        texte = valeur

    # The call form, for a body that fits on one line.
    effacer = export(lambda: remplir(""))
</script>

<template>
    <p class="texte">{{ texte }}</p>
</template>
