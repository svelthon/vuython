<script lang="python">
    # An annotation is a declaration of interface, the way a dataclass field is:
    # `name: str` is a prop, and the assignment is its default.
    name: str = "world"
    excited: bool = False

    greeting => f"Hello {name}{'!' if excited else '.'}"
</script>

<template>
    <p class="greeting">{{ greeting }}</p>
</template>
