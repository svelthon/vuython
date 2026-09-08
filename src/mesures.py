# `__js__` is `importjs` for a file that has no markup. A module never asks for
# a default export, a stylesheet or a namespace — those are all template
# concerns — so only the named form is left, and it can stay real Python read
# off the AST where `importjs` had to become a keyword.
__js__ = {"./helpers.js": ["half"]}

# And `__all__` says what a JavaScript caller may reach.
__all__ = ["moitie", "ajouter"]

valeurs = []

total => sum(valeurs)


def ajouter(n):
    valeurs.append(n)


def moitie(n):
    # Called through the boundary, so the answer comes back as Python: an int
    # that cannot be multiplied is a JavaScript number wearing the wrong hat.
    return half(n) * 2
