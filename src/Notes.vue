<script lang="python">
    notes = [12, 15, 8]
    entry = ""

    # A derived: re-read whenever what it reads has moved.
    moyenne => round(sum(notes) / len(notes), 1) if notes else 0

    def ajouter():
        # No copy, no reassignment: the mutation itself is what notifies.
        global entry
        notes.append(int(entry))
        entry = ""

    def retirer(note):
        notes.remove(note)
</script>

<template>
    <form @submit.prevent="ajouter()">
        <!-- v-model on a Python name needs no rewriting: the name is a property
             of the very object setup() returned. -->
        <input v-model="entry" type="number" placeholder="une note">
        <button :disabled="entry == ''">ajouter</button>
    </form>

    <ul>
        <li v-for="note in notes" :key="note">
            {{ note }}
            <button @click="retirer(note)">x</button>
        </li>
    </ul>

    <p v-if="notes">moyenne : {{ moyenne }}</p>
    <p v-else>aucune note</p>
</template>
