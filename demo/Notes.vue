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
    <form class="row" @submit.prevent="add()">
        <!-- v-model on a Python name needs no rewriting: the name is a property
             of the very object setup() returned. -->
        <input v-model="entry" type="number" placeholder="a grade">
        <button :disabled="entry == ''">add</button>
    </form>

    <ul class="chips">
        <li v-for="note in notes" :key="note">
            {{ note }}
            <button @click="remove(note)" aria-label="remove">x</button>
        </li>
    </ul>

    <p v-if="notes" class="result">average: {{ average }}</p>
    <p v-else class="result">no grades</p>
</template>
