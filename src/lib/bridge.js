// What every compiled component imports, on Bryntime's engine, which its one
// entry loads and starts.
import { host, lent, track as tracked, follow as followed, pyHandler, pyError, scheduleAsync } from 'bryntime';

// A JavaScript value copied in for Python; a module's namespace published under
// its Python name, so another component's Python can `import` it and reach the
// very same refs; and a JavaScript function a Python module reached for with
// `importjs`, called with Python's values and answering in Python's; and a
// module's body run in the namespace Vuython hands Brython instead of the one it
// would have made for itself; and a Python function made callable from
// JavaScript, the call trimmed to its signature, a coroutine awaited and what
// it returns crossing back, at every door: a handler, a hook, an export; and
// what a Python function hands to something outside Python, copied as plain
// data; and a Python exception with its message and its place filled in:
// Bryntime's, as they are.
export { pyData, plainData, registerModule, jsCall, withNamespace, pyHandler, pyError } from 'bryntime';
import { customRef, shallowRef } from 'vue';

// What only Vue knows, told to Bryntime (`host`): its name, which signs a
// refusal, and how a reaction subscribes to a Python value Bryntime watches.
// A `customRef` is Vue's own signal: reading it inside an effect subscribes
// the effect, writing it runs the effect again. Vue says nothing when the last
// reader leaves, so a value once followed stays joined to its signal.
host.name = 'vuython';
host.subscriber = (start) => {
    let joined = false;
    const signal = customRef((track, trigger) => ({
        get() {
            track();
            return undefined;
        },
        set() {
            trigger();
        }
    }));

    return () => {
        void signal.value;
        if (!joined) {
            joined = true;
            start(() => {
                signal.value = undefined;
            });
        }
    };
};

// Python's None, so a prop the parent never passed reads as None rather than
// leaking JavaScript's undefined into Python.
export const NONE = globalThis.__BRYTHON__.builtins.None;

// Vue interpolates with String(), and None is an object — it would render as
// "[object Object]". Non-enumerable so nothing that walks the singleton's
// properties can see it.
Object.defineProperty(NONE, 'toString', {
    value: () => 'None',
    enumerable: false,
    configurable: true
});

const _b_ = globalThis.__BRYTHON__.builtins;

// Inside a Vue template you are in JavaScript, not Python — and the two
// disagree. This is the bridge behind `__truthy`, `__text`, `__seq` and
// `__spread`, the names a compiled template expression actually calls.
export const __pybridge = {
    // JS calls every object truthy, so `v-if="items"` would be true for an empty
    // list, an empty dict, or None. Conditions are rewritten to go through this.
    truthy(value) {
        if (value === undefined || value === null) return false;
        // str/int/float/bool are JS primitives in Brython, and there the two
        // languages already agree.
        if (typeof value !== 'object' && typeof value !== 'function') return Boolean(value);
        try {
            return _b_.bool.$factory(value) === true;
        } catch {
            return Boolean(value);
        }
    },

    // Python's str(), for interpolation: `['a', 'b']` rather than `a,b`.
    //
    // None renders as nothing, like null and undefined beside it. In a template
    // the default failure is absence, not a word that means nothing to whoever
    // is reading the page.
    str(value) {
        if (value === undefined || value === null || value === NONE) return '';
        try {
            return _b_.str.$factory(value);
        } catch {
            return String(value);
        }
    },

    // `v-for` walks a JavaScript array. A Python list or tuple already is one,
    // but a dict, a set, a range, a generator or the result of .items() is not —
    // and iterating those is the whole point of writing the loop in Python.
    seq(value) {
        // A row of a watched list is watched already: Bryntime walks what a
        // container holds when it comes under watch, and hands the watch to
        // what enters it afterwards.
        if (Array.isArray(value)) return value;
        if (value === undefined || value === null) return [];

        try {
            return _b_.list.$factory(value);
        } catch (error) {
            if (value && typeof value[Symbol.iterator] === 'function') return value;
            throw error;
        }
    },

    // What Python hands *out* to a DOM boundary — a `v-model`, and an attribute
    // written `:href="value"`. Python's None is an object, so Vue would write it
    // straight through and an `<input>` would show the word "None". Undefined is
    // what JavaScript means by "nothing here yet".
    //
    // Only None. Zero, an empty string and False are values a binding must keep.
    bound(value) {
        return value === NONE ? undefined : value;
    },

    // `v-bind="attrs"` — Vue diffs the spread object against the previous
    // render's, and a dict mutated in place *is* the same object. A shallow copy
    // is returned, so a Python spread renders like its JavaScript counterpart.
    spread(value) {
        if (value === null || value === undefined || typeof value !== 'object') return value;
        return { ...value };
    },

    // A JavaScript array handed back to Python. A list *is* an array in Brython,
    // but not every array is a list: one built here — by `.slice()`, say — reads
    // as a `JavascriptArray`, which prints `[A, B]` where Python prints
    // `['A', 'B']`.
    list(items) {
        return _b_.list.$factory(items);
    }
};

// An in-place mutation, `notes.append(15)` with nothing after it, is
// Bryntime's to see (`track`, `follow`). What is Vuython's is below.
function keepAccessors($B) {
    if ($B.$vuythonAccessors) return;
    $B.$vuythonAccessors = true;

    // Rebinding a global emits `$B.delete_for_reassign(name, locals)` ahead of
    // the assignment, and its plain `delete namespace[name]` would drop the
    // accessor for good — silently unhooking the signal after the very first
    // write, so `count = count + 1` stops propagating while `count += 1` still
    // works.
    //
    // Svelthon dodged this by putting the accessors on a *prototype*, where
    // `delete` cannot reach them. Vue forbids that: `hasSetupBinding` calls
    // `hasOwn(setupState, key)`, so a name Vue cannot find as an own property is
    // a name its template will not read. The accessors have to be own
    // properties, so the delete is what gives way instead — for our namespaces
    // only, recognised by a flag they carry and nothing else does.
    const reassign = $B.delete_for_reassign;
    $B.delete_for_reassign = function (name, namespace) {
        if (namespace !== null && typeof namespace === 'object' && namespace.$vuython) return;
        return reassign(name, namespace);
    };
}

keepAccessors(globalThis.__BRYTHON__);

// A value written into a Python name from the JavaScript side.
//
// `v-model` on a group of checkboxes hands the name a **JavaScript array**, and
// an array is not a list: Brython reads one it did not make as a
// `JavascriptArray`, which prints `[riz, sel]` where Python prints
// `['riz', 'sel']` — and answers `AttributeError` to `.append`.
//
// Told apart by `ob_type`, which every Brython value carries and no array from
// JavaScript has. So a list written from Python crosses untouched, and one
// written by a directive becomes what the author will reach for.
//
// Only arrays. A plain object would have to become a dict, and a *Python* object
// is a plain object too — converting those would turn every instance into a
// dictionary of its own internals.
function adopt(value) {
    return Array.isArray(value) && value.ob_type === undefined
        ? _b_.list.$factory(value)
        : value;
}

// The value stored under a module-level name, watched: `bump` is told of every
// change Python makes to it or to anything under it, and the name's ref, which
// `bump` triggers, wakes whatever read the name. Under Vue that is one ref,
// where Svelte needed a second signal beside the value, because `$state.raw`
// drops a write whose value is unchanged by `===`.
export function track(value, bump) {
    value = adopt(value);
    tracked(value, bump);

    return value;
}

// Subscribe the caller to the value it is being handed.
//
// Every other accessor reads the ref of its own name, which is enough. A
// `computed` is not: Vue compares its result with `hasChanged` before waking its
// readers, so a derived that hands back the very object it was given propagates
// nothing when that object is mutated in place. Reading the marker
// re-establishes the link at the far end, where the reader is, rather than
// trying to defeat the memoisation.
export function follow(value) {
    followed(value);

    return value;
}

// Line numbers in a traceback count from the start of the Python source, which
// for a component begins after its opening <script> tag. Each file says how far
// down that is when its module loads (`placed`), and Bryntime asks when it names
// a frame of that file in an error.
const OFFSETS = new Map();

lent.place = (file, line) => line + (OFFSETS.get(file) ?? 0);

export function placed(file, offset) {
    OFFSETS.set(file, offset);
}

// `pep.title` inside the markup, on a dict.
//
// A template's expressions already differ from the same text in the script: a
// `v-if` goes through `__truthy` so an empty list is false the Python way, an
// interpolation through `__text` so a list renders `['a', 'b']`, an iterable
// through `__seq`. The dot joins them — it finds an attribute, and failing that
// a key, which is what Jinja does with `foo.bar`.
//
// Attribute first, so a dict's real methods keep winning: `{{ d.items }}` is the
// method, not a key called "items". A name that is neither raises the
// AttributeError it always did.
const MISSING = Symbol('vuython.missing');

export function inTemplate(run) {
    const $B = globalThis.__BRYTHON__;
    const original = $B.$getattr_pep657;

    $B.$getattr_pep657 = (obj, attr, inum) => {
        // With a default, so a miss costs no exception.
        const found = $B.$getattr(obj, attr, MISSING);
        if (found !== MISSING) return found;

        try {
            return $B.$getitem(obj, attr);
        } catch {
            /* no such key either: let the real lookup raise, with its position */
        }

        return original(obj, attr, inum);
    };

    try {
        return run();
    } finally {
        $B.$getattr_pep657 = original;
    }
}

// What `(obj.attr := value)` and `(obj[key] := value)` compile to — the two
// targets Python's own grammar refuses the walrus, and that Vue's `=` takes.
//
// The dot carries the same rule `inTemplate` installs for a read: an existing
// key wins over an attribute, so the write lands where the read came from. The
// rule is repeated here rather than borrowed, because a handler fires on the
// click, long after the expression that built it has left `inTemplate` and put
// the original attribute lookup back.
//
// Both return the value, as an assignment expression must.
export function writeAttr(target, name, value) {
    const $B = globalThis.__BRYTHON__;

    if ($B.$getattr(target, name, MISSING) === MISSING) {
        try {
            $B.$getitem(target, name);
            $B.$setitem(target, name, value);
            return value;
        } catch {
            /* no such key: the real assignment decides */
        }
    }

    $B.$setattr(target, name, value);
    return value;
}

export function writeItem(target, key, value) {
    globalThis.__BRYTHON__.$setitem(target, key, value);
    return value;
}

// One expression the markup pass lifted out of the template, read back.
//
// The dot rule above is installed for the length of the call and taken down
// after: a handler fires long after the expression that built it has returned,
// and leaving the rule up would change what `obj.attr` means everywhere in the
// program.
//
// Memoised per function, because Vue keeps what a render gave it and compares
// handlers by identity between renders.
const templates = new WeakMap();

export function template(fn, where) {
    if (typeof fn !== 'function') return fn;

    let wrapped = templates.get(fn);

    if (wrapped === undefined) {
        wrapped = (...args) => {
            try {
                // Scheduled, because a handler written `@click="charger()"`
                // becomes an inline statement whose *value* is the call's
                // result. An `async def` returns a coroutine there, and Vue
                // drops a statement's value — so without this the click ran the
                // body up to nothing at all and said nothing about it.
                //
                // Free on everything else: `scheduleAsync` returns at once for
                // a value that is not awaitable, which is every other template
                // expression.
                return scheduleAsync(inTemplate(() => fn(...args)), where);
            } catch (error) {
                throw pyError(error, where);
            }
        };

        templates.set(fn, wrapped);
    }

    return wrapped;
}

// `v-highlight="colour"` — a Python function that gets the element itself.
//
// Vue's contract is an object of hooks, and it is read from the `directives`
// option, which is **static**: it belongs to the component, not to an instance.
// The Python function is the opposite — it lives in a namespace one `setup()`
// built. `binding.instance` is what joins them: Vue hands every hook the
// component instance the directive was used in, and reading a name off that
// instance goes through the accessor to the very function that instance defined.
//
// The contract this gives Python is Svelte's action, which is the one a reader
// arriving from Svelthon already knows: called with the node and the value,
// re-called when the value moves, and whatever it returns is its destructor.
// Mapped onto Vue's three hooks, which is exactly what they are for.
const teardowns = new WeakMap();

export function pyDirective(name) {
    const stop = (el) => {
        const previous = teardowns.get(el);

        if (typeof previous === 'function') previous();
        teardowns.delete(el);
    };

    const run = (el, binding) => {
        stop(el);

        const fn = binding.instance && binding.instance[name];
        const result = pyHandler(fn)(el, binding.value);

        if (typeof result === 'function') teardowns.set(el, pyHandler(result));
    };

    return { mounted: run, updated: run, unmounted: stop };
}

// The accessor pair for one module-level Python name.
//
// Own properties, not a prototype: Vue's `hasSetupBinding` calls
// `hasOwn(setupState, key)` before it will read a name, so an inherited accessor
// is a name the template cannot see. What that costs is one interception of
// `delete_for_reassign` in the mutation tracking above; what it buys is that the
// object `setup()` returns and the object Brython writes into are the same
// object.
// One clock for the whole page, behind `fromnow`.
//
// Under Svelte this needed `createSubscriber` from `svelte/reactivity`, whose
// whole job is to tell a signal when somebody starts and stops watching it. Vue
// asks for none of that: reading a ref inside a render is the subscription, and
// the timer disarms itself after each tick — it is re-armed only if something
// read the value again, so a page with nothing left to count stops counting.
//
// Never longer than a day: `setTimeout` overflows past 2^31 ms and fires at
// once, forever.
const AT_MOST = 86400000;
const clock = shallowRef(0);

let armed = null;
let wanted = Infinity;

export function ticking(after) {
    // Registers the dependency: whoever is reading re-runs on the next tick.
    clock.value;

    if (!(after > 0)) return;

    wanted = Math.min(wanted, after, AT_MOST);

    const at = Date.now() + wanted;

    // Keep the soonest of everything asked for since the last tick.
    if (armed && armed.at <= at) return;
    if (armed) clearTimeout(armed.timer);

    armed = {
        at,
        timer: setTimeout(() => {
            armed = null;
            wanted = Infinity;
            clock.value += 1;
        }, wanted)
    };
}

export function bind(namespace, key, get, set) {
    Object.defineProperty(namespace, key, {
        get,
        set,
        enumerable: true,
        configurable: true
    });
}

// What a module namespace holds besides the author's names: Brython's own
// `__file__`, `__doc__` and `$annotations`, the words the compiler injects, one
// generated name per lambda the codegen lifted out of an arrow, and a function
// for every expression the markup pass took out of the template. Vue walks the
// setup state in development to mirror it onto the render context, and warns
// about every key beginning with `_` or `$` — fifteen warnings a component, for
// names nobody wrote.
//
// So the list is inverted: what the author declared stays visible and everything
// else is hidden, rather than a prefix rule that a generated `lambda_ct231m3n`
// walks straight past.
//
// Enumerability is all that changes: `hasOwn` and the property lookup both
// ignore it, so the template still reads every name it could read before.
export function hide(namespace, shown) {
    const keep = new Set(shown);

    for (const key of Object.getOwnPropertyNames(namespace)) {
        if (!keep.has(key)) Object.defineProperty(namespace, key, { enumerable: false });
    }
}
