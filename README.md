# Vuython

**Vue single-file components written in Python, compiled at build time.**

```vue
<script lang="python">
    notes = [12, 15, 8]

    moyenne => round(sum(notes) / len(notes), 1)

    def ajouter(note):
        notes.append(note)
</script>

<template>
    <li v-for="note in notes">{{ note }}</li>
    <p>moyenne : {{ moyenne }}</p>
</template>
```

`notes.append(15)` and nothing after it: no copy, no reassignment, no proxy. The
average on screen follows.

Built to answer one question about Vue, then filled in. What follows is how to
run it and how it works.

## Run it

```
npm install
npm test          # 135 tests
npm run dev       # http://localhost:5195
npm run build
```

## How it works

Nothing about Vue is patched or forked, and no hook of Vue's is used.

1. **A Vite plugin at `enforce: 'pre'`** rewrites the `.vue` source before
   `@vitejs/plugin-vue` ever parses it. Downstream, the component is ordinary
   JavaScript.

2. **The template pass** lifts every expression out of the markup into a
   generated Python function and leaves a call behind — `{{ moyenne }}` becomes
   `{{ __expr_1() }}`. Vue parses expressions with Babel and rewrites free
   identifiers to `_ctx.x`, so Python cannot survive there as text.

3. **Brython compiles the Python under Node**, at build time. Its codegen puts
   every module-level name into a namespace object it obtains from one call,
   `$B.namespace('X')` — so intercepting that single call is enough to hand it a
   namespace of our own.

4. **That namespace is what `setup()` returns.** Each Python name is an own
   accessor over a `shallowRef`; Vue reads the template out of the same object
   Brython writes into. There is no second copy to keep in step.

5. **A mutation is caught by Brython, not by a proxy.** Every method call in the
   language goes through `$B.call_attr` and every indexed write through
   `$B.$setitem`, so `notes.append(15)` is caught where it happens and answered
   with `triggerRef` on the name's own ref. The value keeps its identity, and
   `type(notes) is list` stays true.

## What Python buys, and what it costs

| Python | what it becomes |
| --- | --- |
| `count = 0` | reactive state |
| `doubled => count * 2` | a `computed` |
| `@derived` on a `def` | the same, over a body |
| `name: str = "monde"` | a declared prop, with its default |
| `value: str <=>` | a prop plus an `update:value` event, for `v-model:value` |
| `@effect` | `watchEffect(…, { flush: 'post' })`, its return value the destructor |
| `@effect.pre` | `watchEffect(…)`, Vue's own default flush |
| `@effect.root` | `effectScope()`, the decorated name reading as its stopper |
| `def on_mount()` | `onMounted` |
| `def on_destroy()` | `onUnmounted` |
| `@export` on a `def` | `defineExpose` — what a parent reaches through a ref |
| `f = export(lambda: …)` | the same, in one line |
| `provide(k, v)` / `inject(k)` | Vue's own, spelled the Python way |
| `inspect(*values)` | a console.log that re-runs, dropped in a production build |
| `importjs X from "./X.vue"` | a JavaScript import — and a component registration |
| `import panier` | a shared `.py`, whose names are refs at module scope |
| `__all__ = [...]` | what the module hands JavaScript |
| `__js__ = {...}` | the same, for a `.py` that needs JavaScript |
| `(open := not open)` | an assignment inside a handler |
| `@directive` on a `def` | a `v-` name that gets the element |
| `props_id()` | Vue's `useId()` |
| `async def` | run on Brython's own loop, `await` and all |

In the template, the Python is Python: `{{ notes }}` renders `[12, 15, 8]` and
not `12,15,8`, `v-if="notes"` is false for an empty list, `v-for` walks a dict or
a generator, and `pep.title` finds a key when there is no attribute.

`v-model="entry"` needs no rewriting at all: Vue compiles it to
`_ctx.entry = $event`, and `entry` is a property of the very object `setup()`
returned. The same goes for a slot's scope, a `v-for` that destructures a dict by
key, and `v-model` over a list of checkboxes — three things Svelthon had to build
and Vuython inherits.

And fifteen helpers under the words a Django or Jinja author already searches
for: `tojson`, `batch`, `date`, `fromnow`, `slugify`, `striptags`, `urlencode`,
`to_js`, `to_py` and the rest.

## Routing

`vue-router` needs nothing from Vuython: it wants a list of paths and the
components to show, and a Vuython component is a Vue component. A Python
component can also call `useRoute()` through `importjs` and read the route live —
including across a navigation that reuses the component.

Nuxt builds and runs client-side. Nuxt *server* rendering is blocked, for a
reason worth naming precisely: Nitro folds `document` to `undefined` at build
time, and Brython's bootstrap reads it unconditionally. Plain Vue SSR works.

## What it does not do

`{@const}` has no Vue equivalent to port to — Vue has no declaration tag. There
is no `host()`, Svelte's custom-element hook.

## Where it comes from

[Svelthon](../SVELTHON) is the same idea on Svelte, and further along. Vuython
reuses its Brython half unchanged — the mutation tracking, the namespace
interception, the boundary conversions, the error reporting — and rebuilds the
framework half.
