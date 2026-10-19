<script lang="python">
    # An annotation is a declaration of interface, the way a dataclass field is:
    # `name: str` is a prop, and the assignment is its default.
    name: str = "monde"
    excited: bool = False

    salutation => f"Bonjour {name}{'!' if excited else '.'}"
</script>

<template>
    <p>{{ salutation }}</p>
</template>
