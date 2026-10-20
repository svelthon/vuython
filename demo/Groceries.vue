<script lang="python">
    importjs Card from "./Card.vue"

    stock = [{"id": 7, "name": "salt"}, {"id": 8, "name": "pepper"}]

    ticked = []
    choice = "a"
</script>

<template>
    <Card title="shopping">
        <!-- The slot props are Python names inside the block, exactly as a
             v-for alias is. -->
        <template #row="{ item, rank }">
            <b class="label">{{ rank }}: {{ item.name.upper() }}</b>
        </template>

        <p class="default">{{ len(stock) }} in stock</p>
    </Card>

    <!-- `{ id, name }` destructures a Brython dict: its keys are ordinary
         JavaScript properties, so Vue's own destructuring reaches them. -->
    <p class="row">
        unpacked
        <code v-for="{ id, name } in stock" :key="id" class="destructure">{{ id }}:{{ name }}</code>
    </p>

    <!-- v-model over an array, which is Svelte's `bind:group`. Nothing here is
         ours: the name is a property of the object setup() returned. -->
    <div class="row">
        <label><input type="checkbox" value="rice" v-model="ticked"> rice</label>
        <label><input type="checkbox" value="salt" v-model="ticked"> salt</label>

        <!-- What the directive wrote has to be a real list, not a JavaScript
             array wearing the name: `.append` is the test that tells them
             apart. -->
        <button class="add" @click="ticked.append('pepper')">add pepper</button>
    </div>
    <p>ticked <code class="ticked">{{ ticked }}</code></p>

    <div class="row">
        <label><input type="radio" value="a" v-model="choice"> a</label>
        <label><input type="radio" value="b" v-model="choice"> b</label>
    </div>
    <p>picked <code class="choice">{{ choice }}</code></p>
</template>
