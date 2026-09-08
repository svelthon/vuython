<script lang="python">
    importjs {shout, twice, half} from "./helpers.js"
    importjs named from "./helpers.js"
    importjs * as helpers from "./helpers.js"

    def loud(text):
        return shout(text)

    # A Python callable handed to JavaScript, called back with a Python value.
    def echo(value):
        return twice(lambda one: f"<{one}>", value)

    # The answer has to be Python: an int that cannot be multiplied is a
    # JavaScript number wearing the wrong hat.
    doubled_half => half(9) * 2
</script>

<template>
    <p class="a">{{ loud("bonjour") }}</p>
    <p class="b">{{ echo("x") }}</p>
    <p class="c">{{ doubled_half }}</p>
    <p class="d">{{ named("x") }} / {{ helpers.shout("y") }}</p>
</template>
