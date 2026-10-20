<script lang="python">
    notes = [12, 15, 8]
    entry = ""

    # A derived: re-read whenever what it reads has moved.
    average => round(sum(notes) / len(notes), 1) if notes else 0

    def add():
        # No copy, no reassignment: the mutation itself is what notifies.
        global entry
        notes.append(int(entry))
        entry = ""

    def remove(note):
        notes.remove(note)
</script>

<template>
    <form @submit.prevent="add()">
        <!-- v-model on a Python name needs no rewriting: the name is a property
             of the very object setup() returned. -->
        <input v-model="entry" type="number" placeholder="a grade">
        <button :disabled="entry == ''">add</button>
    </form>

    <ul>
        <li v-for="note in notes" :key="note">
            {{ note }}
            <button @click="remove(note)">x</button>
        </li>
    </ul>

    <p v-if="notes">average: {{ average }}</p>
    <p v-else>no grades</p>
</template>
