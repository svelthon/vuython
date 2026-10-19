<script lang="python">
    importjs {delay, fail} from "./helpers.js"

    from browser import aio

    etat = "au repos"
    erreur = ""

    # An `async def` called from a handler returns a coroutine that nobody runs:
    # the click appears to do nothing at all, silently. Brython has its own event
    # loop, so the boundary hands it over.
    async def charger():
        global etat
        etat = "en cours"
        valeur = await delay("des lentilles", 10)
        etat = f"reçu : {valeur}"

    async def attendre():
        global etat
        await aio.sleep(0.01)
        etat = "réveillé"

    # An exception raised inside a coroutine reaches nothing at all unless the
    # boundary reports it.
    async def casser():
        global erreur
        try:
            await fail("cassé")
        except Exception as e:
            erreur = str(e)
</script>

<template>
    <p class="etat">{{ etat }}</p>
    <p class="erreur">{{ erreur }}</p>
    <button class="charger" @click="charger()">charger</button>
    <button class="dormir" @click="attendre()">dormir</button>
    <button class="casser" @click="casser()">casser</button>
</template>
