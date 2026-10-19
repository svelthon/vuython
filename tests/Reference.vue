<script lang="python">
seen = []

def add():
    seen.append('add')

def kind(event):
    seen.append(event.type)

def choose(first, second):
    seen.append(first + second)

def other():
    seen.append('other')

def swap():
    global add
    add = other

class Box:
    def __init__(self):
        self.n = 0

    def bump(self):
        self.n += 1
        seen.append(f'box{self.n}')

box = Box()

def fail():
    raise ValueError('no')
</script>

<template>
    <button class="add" @click="add">add</button>
    <button class="kind" @click="kind">kind</button>
    <button class="box" @click="box.bump">box</button>
    <button class="swap" @click="swap()">swap</button>
    <button class="fail" @click="fail">fail</button>
    <form @submit.prevent="add"><button>send</button></form>
    <Pick @pick="choose" />
    <p>{{ ' '.join(seen) }}</p>
</template>
