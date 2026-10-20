# A shared module: an ordinary .py, whose names become refs at module scope and
# are therefore created once for the whole application rather than once per
# component instance.
#
# No marker in the name. Svelte compiles its runes, so a module holding them has
# to be called `cart.svelte.ts` for the compiler to know; Vue's reactivity is a
# runtime library, so there is nothing for a compiler to be told.
lines = []

total => sum(line["price"] for line in lines)

@derived
def summary():
    if not lines:
        return "empty cart"
    return f"{len(lines)} item(s), €{total}"


def add(name, price):
    lines.append({"name": name, "price": price})


def empty():
    lines.clear()
