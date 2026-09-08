# A shared module: an ordinary .py, whose names become refs at module scope and
# are therefore created once for the whole application rather than once per
# component instance.
#
# No marker in the name. Svelte compiles its runes, so a module holding them has
# to be called `panier.svelte.ts` for the compiler to know; Vue's reactivity is
# a runtime library, so there is nothing for a compiler to be told.
lignes = []

total => sum(ligne["prix"] for ligne in lignes)

@derived
def resume():
    if not lignes:
        return "panier vide"
    return f"{len(lignes)} article(s), {total} euros"


def ajouter(nom, prix):
    lignes.append({"nom": nom, "prix": prix})


def vider():
    lignes.clear()
