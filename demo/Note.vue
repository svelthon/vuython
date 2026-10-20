<script lang="python">
    # A Vue composable, called from Python during setup(). `useRoute` returns a
    # reactive object; the boundary hands it over as it is, so reading through it
    # stays a live read rather than a snapshot.
    importjs {useRoute} from "vue-router"

    route = useRoute()

    # The parameter is a string, and Python is the one language here that will
    # not silently compare it to a number.
    doubled => int(route.params.id) * 2
</script>

<template>
    <h2 class="page">note {{ route.params.id }}</h2>
    <p class="double">{{ doubled }}</p>
    <router-link to="/" class="back">back</router-link>
</template>
