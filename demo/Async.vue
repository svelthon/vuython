<script lang="python">
    importjs {delay, fail} from "./helpers.js"

    from browser import aio

    state = "idle"
    error = ""

    # An `async def` called from a handler returns a coroutine that nobody runs:
    # the click appears to do nothing at all, silently. Brython has its own event
    # loop, so the boundary hands it over.
    async def load():
        global state
        state = "loading"
        value = await delay("lentils", 10)
        state = f"received: {value}"

    async def wait():
        global state
        await aio.sleep(0.01)
        state = "awake"

    # An exception raised inside a coroutine reaches nothing at all unless the
    # boundary reports it.
    async def crash():
        global error
        try:
            await fail("broken")
        except Exception as e:
            error = str(e)
</script>

<template>
    <p class="state">{{ state }}</p>
    <p class="error">{{ error }}</p>
    <button class="load" @click="load()">load</button>
    <button class="sleep" @click="wait()">sleep</button>
    <button class="crash" @click="crash()">crash</button>
</template>
