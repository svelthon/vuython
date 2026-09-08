// What every compiled component imports. Order is load-bearing: globals, then
// Brython, then boot.
import './globals.js';
import '../../vendor/brython.js';
import '../../vendor/sys.js';
import './boot.js';
import { shallowRef } from 'vue';

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
        if (Array.isArray(value)) {
            // Hand the watch down to the rows: v-for walks the array in
            // JavaScript, never through $getitem, so this is the only path by
            // which an item can come under watch before its block reads it.
            if (value.$notify !== undefined) {
                for (const item of value) inherit(value, item);
            }

            return value;
        }
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

// Methods that change a container. `__setitem__` and `__delitem__` are not
// here: Brython compiles `d[k] = v` and `del d[k]` to their own calls, caught
// below.
const MUTATORS = new Set([
    'append', 'extend', 'insert', 'remove', 'pop', 'clear', 'sort', 'reverse',
    'add', 'discard', 'update', 'setdefault', 'popitem', 'appendleft',
    'extendleft', 'popleft', 'rotate', 'intersection_update',
    'difference_update', 'symmetric_difference_update'
]);

// Methods that hand out a container the caller can then mutate, without any
// indexing to catch it.
const VIEWS = new Set(['items', 'values']);

// Make an in-place mutation reactive — `notes.append(15)` with nothing after it.
//
// This half is Brython's, and it is the half that ports unchanged: every method
// call in the language goes through `$B.call_attr`, every indexed write through
// `$B.$setitem`. Two interceptions cover the whole language, whatever framework
// is on the other side. Vue changes only what the marker *does* when it fires.
//
// A Python list *is* a JavaScript array, so the object itself carries a
// non-enumerable marker rather than being proxied — `$B.get_class` reads only
// `ob_type`, so `type(items) is list` stays true and `repr` is untouched.
function installMutationTracking($B) {
    if ($B.$vuythonTracking) return;
    $B.$vuythonTracking = true;

    const notify = (obj) => {
        if (obj !== null && typeof obj === 'object' && obj.$notify !== undefined) obj.$notify();
    };

    // Rest arguments rather than `arguments` + apply: these sit on the hottest
    // path Brython has, and the old form blocks V8's optimiser.
    const callAttr = $B.call_attr;
    $B.call_attr = function (obj, attr, ...rest) {
        const result = callAttr(obj, attr, ...rest);

        // The marker is checked first on purpose: this runs on every method call
        // in the program, and an unwatched object must pay one property miss.
        if (obj !== null && typeof obj === 'object' && obj.$notify !== undefined) {
            if (MUTATORS.has(attr)) {
                if (attr === 'setdefault') inherit(obj, result);
                obj.$notify();
            } else if (VIEWS.has(attr)) {
                // `.items()` and `.values()` hand out the children without ever
                // indexing them. A Brython dict exposes its keys as enumerable
                // JavaScript properties, so the values are reachable directly.
                for (const key in obj) inherit(obj, obj[key]);
            } else if (attr === 'get') {
                inherit(obj, result);
            }
        }

        return result;
    };

    const setitem = $B.$setitem;
    $B.$setitem = function (obj, key, value, ...rest) {
        const result = setitem(obj, key, value, ...rest);
        if (obj !== null && typeof obj === 'object' && obj.$notify !== undefined) {
            inherit(obj, value); // `d["rows"] = rows` puts rows under watch too
            obj.$notify();
        }
        return result;
    };

    // Reading is where nesting is caught, and it is the hottest of the three.
    const getitem = $B.$getitem;
    $B.$getitem = function (obj, ...rest) {
        const result = getitem(obj, ...rest);
        if (obj !== null && typeof obj === 'object' && obj.$notify !== undefined) {
            inherit(obj, result);
        }
        return result;
    };

    const delitem = $B.$delitem;
    $B.$delitem = function (obj, ...rest) {
        const result = delitem(obj, ...rest);
        notify(obj);
        return result;
    };

    // `box.value = 1` and `del box.value`. Brython compiles an attribute write
    // through one of two entry points depending on the statement, and both have
    // to be covered or the rule would hold only half the time.
    for (const name of ['$setattr', '$setattr1']) {
        const setattr = $B[name];
        $B[name] = function (obj, attr, value, ...rest) {
            const result = setattr(obj, attr, value, ...rest);
            if (obj !== null && typeof obj === 'object' && obj.$notify !== undefined) {
                inherit(obj, value);
                obj.$notify();
            }
            return result;
        };
    }

    const delattr = $B.$delattr;
    $B.$delattr = function (obj, ...rest) {
        const result = delattr(obj, ...rest);
        notify(obj);
        return result;
    };

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

installMutationTracking(globalThis.__BRYTHON__);

// Only a container can be mutated in place; a scalar propagates by rebinding,
// which the accessor already handles.
function mutable(value) {
    if (value === null || value === undefined || typeof value !== 'object') return false;
    if (Array.isArray(value)) return true; // list — a tuple is one too, and immutable
    if (value === NONE) return false; // a singleton shared by the whole program

    try {
        const cls = globalThis.__BRYTHON__.get_class(value);
        // A class object is not data — and a function is not an object here.
        return cls !== undefined && cls !== _b_.type;
    } catch {
        return false; // a foreign JavaScript value is not ours to mark
    }
}

// Brython keeps an instance's attributes under a private symbol, not as JS
// properties — so they have to be found once, from the first object carrying it.
let DICT;

function ownAttributes(value) {
    if (Array.isArray(value)) return undefined;

    if (DICT === undefined) {
        DICT = Object.getOwnPropertySymbols(value).find((symbol) => symbol.description === 'DICT');
        if (DICT === undefined) return undefined;
    }

    return value[DICT];
}

function mark(value, bumps, reads) {
    const marker = () => {
        for (const one of bumps) one();
    };
    marker.bumps = bumps;
    marker.reads = reads;
    marker.follow = () => {
        for (const one of reads) one();
    };

    try {
        Object.defineProperty(value, '$notify', {
            value: marker,
            enumerable: false,
            configurable: true
        });
    } catch {
        /* a frozen object is not ours: leave it alone */
        return value;
    }

    // A container already sitting in an attribute — `self.rows = []` written in
    // __init__ — was put there before the object came under watch. Hand it the
    // watch now; inherit() marks in turn, so depth follows on its own.
    const attributes = ownAttributes(value);
    if (attributes !== undefined) {
        for (const key in attributes) inherit(value, attributes[key]);
    }

    return value;
}

// Attach a marker to the value stored under a module-level name.
//
// `bump` says it moved; `read` subscribes whoever is asking. Under Vue the two
// are the same ref — `triggerRef(r)` fires the dep that `r.value` registers —
// where Svelte needed a second signal beside the value, because `$state.raw`
// drops a write whose value is unchanged by `===`.
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

export function track(value, bump, read) {
    value = adopt(value);

    if (value === null || typeof value !== 'object') return value;

    // Cheapest path first: a value already watched is the common case.
    const own = value.$notify;
    if (own !== undefined) {
        if (!own.bumps.includes(bump)) {
            own.bumps.push(bump);
            own.reads.push(read);
        }
        return value;
    }

    return mutable(value) ? mark(value, [bump], [read]) : value;
}

// A container read out of a watched one comes under the same watch. This is
// what deep proxying buys Vue, done lazily and without a single proxy: the child
// is marked the first time Python reaches for it, which is necessarily just
// before it could be mutated.
function inherit(parent, child) {
    if (child === null || typeof child !== 'object') return child;

    const marker = parent.$notify;
    const own = child.$notify;

    if (own !== undefined) {
        for (let i = 0; i < marker.bumps.length; i++) {
            if (!own.bumps.includes(marker.bumps[i])) {
                own.bumps.push(marker.bumps[i]);
                own.reads.push(marker.reads[i]);
            }
        }
        return child;
    }

    return mutable(child) ? mark(child, marker.bumps.slice(), marker.reads.slice()) : child;
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
    if (value !== null && typeof value === 'object') {
        const marker = value.$notify;
        if (marker !== undefined) marker.follow();
    }

    return value;
}

// A Brython exception reaching JavaScript carries neither `message` nor `stack`,
// so devtools and Vite's overlay show nothing at all — the text sits in the
// Python object, where nothing JS looks. Fill both in, keeping the original
// object so Python semantics upstream are untouched.
export function pyError(error, where, lineOffset = 0) {
    const $B = globalThis.__BRYTHON__;

    if (!error || typeof error !== 'object' || error.message !== undefined) return error;

    // Not ours to describe: a JavaScript value thrown through a Python frame
    // must come out the other side untouched.
    try {
        if ($B.get_class(error) === undefined) return error;
    } catch {
        return error;
    }

    let described;
    try {
        // Not `cls.__name__`: a Brython class keeps it out of its JS properties,
        // so the lookup has to go through Python's own attribute protocol.
        const name = $B.$getattr($B.get_class(error), '__name__');
        described = `${name}: ${_b_.str.$factory(error)}`;
    } catch {
        described = 'PythonError';
    }

    // The deepest frame is where it actually broke. Line numbers count from the
    // start of the Python source, which for a component begins after its opening
    // <script> tag — hence the offset back to the file's own numbering.
    let line;
    try {
        let tb = $B.$getattr(error, '__traceback__');
        while (tb && tb !== NONE) {
            line = $B.$getattr(tb, 'tb_lineno');
            tb = $B.$getattr(tb, 'tb_next');
        }
    } catch {
        /* no usable traceback */
    }

    const at = line === undefined ? where : `${where}:${line + lineOffset}`;

    try {
        error.message = `${described} (${at})`;
        if (error.stack === undefined) error.stack = `${error.message}\n    at ${at}`;
    } catch {
        /* a frozen exception: pass it on as it stands */
    }

    return error;
}

// Calling an `async def` from JavaScript returns a coroutine that nobody runs:
// the handler appears to do nothing at all, silently. Brython has its own event
// loop, so hand it over.
export function schedule(result, where, lineOffset = 0) {
    const $B = globalThis.__BRYTHON__;
    const aio = $B.imported['browser.aio'];

    if (!aio || result === undefined || result === null) return result;

    // Compared in JavaScript rather than through aio.iscoroutine(): this runs on
    // every call into Python, template expressions included, and a Brython call
    // here costs more than the check saves.
    if ($B.get_class(result) !== $B.coroutine) return result;

    // What the caller gets back is a promise, so an `async def` can be awaited
    // by whoever called it. `run(coro, onsuccess, onerror)`: its default onerror
    // only logs, so an exception raised inside a coroutine would reach nothing
    // at all — no error event, no overlay.
    let watched = false;

    const promise = new Promise((resolve, reject) => {
        $B.$getattr(aio, 'run')(
            result,
            (value) => {
                $B.leave_frame(); // what Brython's own default does
                resolve(value);
            },
            (error) => {
                const failure = pyError(error, where, lineOffset);
                reject(failure);

                // An event handler's return value is dropped on the floor, so
                // nobody is there to catch this one. Rethrowing from a timeout
                // turns it into a genuine uncaught error, the way the
                // synchronous path already behaves — but only when the caller
                // really did ignore the promise.
                setTimeout(() => {
                    if (!watched) throw failure;
                });
            }
        );
    });

    const settle = promise.then.bind(promise);

    // Handled here so the browser does not *also* report an unhandled
    // rejection: reporting is this function's job, and it does it above.
    settle(undefined, () => {});

    promise.then = (...handlers) => {
        watched = true;
        return settle(...handlers);
    };

    return promise;
}

// What a Python function hands back to something outside Python.
//
// A Brython dict carries symbol-keyed internals (`Symbol(OB_TYPE)`) that no
// serialiser outside Python will read, so the boundary converts.
export function plainData(value, seen) {
    const $B = globalThis.__BRYTHON__;

    if (value === undefined || value === null || value === NONE) return null;
    if (typeof value !== 'object') return value;

    // A Brython float is an object holding a number and a reference to its type.
    if (value.ob_type === _b_.float) return value.value;

    if ($B.get_class(value) === $B.coroutine) {
        return schedule(value, 'coroutine').then(plainData);
    }

    // A graph that loops back on itself would otherwise recurse until the stack
    // gives out. What is tracked is the *branch being walked*: the same object
    // twice in one list is shared, not circular, and has to come out twice.
    seen ??= new Set();
    if (seen.has(value)) return null;
    seen.add(value);

    try {
        return branch(value, seen);
    } finally {
        seen.delete(value);
    }
}

function branch(value, seen) {
    if (Array.isArray(value)) return value.map((one) => plainData(one, seen)); // list, tuple

    // Anything with a constructor of its own is not ours to flatten: a Response,
    // a URL, a Date, a Map, a Promise.
    if (value.constructor !== undefined && value.constructor !== Object) return value;

    // A class instance keeps its attributes under a private symbol rather than
    // as JavaScript properties, so walking its own keys finds almost nothing and
    // wanders into the class object instead.
    const attributes = ownAttributes(value);

    if (attributes !== undefined && attributes !== null && typeof attributes === 'object') {
        const fields = {};
        for (const key of Object.keys(attributes)) fields[key] = plainData(attributes[key], seen);
        return fields;
    }

    const out = {};
    for (const key of Object.keys(value)) out[key] = plainData(value[key], seen);
    return out;
}

// The inbound twin: a JavaScript value as real Python. The walk is Brython's own
// `JSObj.to_dict()`; what is left here is the root, which a method on an object
// cannot speak for — a scalar, a null, a bare array.
export function pyData(value) {
    const $B = globalThis.__BRYTHON__;

    if (value === undefined || value === null) return NONE;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return _b_.list.$factory(value.map(pyData));

    const python = $B.jsobj2pyobj(value);

    // Idempotent, which it has to be: `jsobj2pyobj` hands back the *original*
    // Python object when the value once came from one, and a dict has no
    // `to_dict`.
    const toDict = $B.$getattr(python, 'to_dict', null);

    return toDict === null ? python : toDict();
}

// A Python function seen from JavaScript, wrapped by reading its own signature
// rather than a declaration we made — the layout is Brython's `$function_infos`:
// [2] the qualified name, [3] the file, [8] the `*args` name if there is one,
// [10] how many positional parameters were declared.
//
// The original is kept on `$js_func` by Brython's own interop wrapper, and it is
// the one that answers for the signature.
function declared(value) {
    if (typeof value !== 'function') return null;

    const fn = typeof value.$js_func === 'function' ? value.$js_func : value;
    const infos = fn.$function_infos;

    // `arity` is what the whole thing is for, so a shape that has no number
    // there is not a Python signature, whatever else it carries.
    if (!Array.isArray(infos) || (!infos[8] && typeof infos[10] !== 'number')) return null;

    return { fn, where: `${infos[2]}() — ${infos[3]}`, arity: infos[8] ? Infinity : infos[10] };
}

// A DOM handler. JavaScript calls with whatever it has — Vue hands `$event` to
// every inline statement — where Python raises on a positional argument it never
// declared. So the call is trimmed to the signature.
export function pyEvent(value, lineOffset = 0) {
    const found = declared(value);
    if (found === null) return value;

    const { fn: called, where, arity } = found;

    return (...args) => {
        try {
            return schedule(called(...args.slice(0, arity)), where, lineOffset);
        } catch (error) {
            throw pyError(error, where, lineOffset);
        }
    };
}

// One Python function, made callable from JavaScript: coroutines awaited,
// containers converted on the way out, and the call trimmed to the signature —
// JavaScript calls with whatever it has, where Python raises on a positional
// argument it never declared.
export function pyCall(fn, where, lineOffset = 0, arity = Infinity) {
    return (...args) => {
        try {
            const result = schedule(fn(...args.slice(0, arity)), where, lineOffset);

            return result instanceof Promise ? result.then(plainData) : plainData(result);
        } catch (error) {
            throw pyError(error, where, lineOffset);
        }
    };
}

export function pyHandler(value) {
    const found = declared(value);

    return found === null ? value : pyCall(found.fn, found.where, 0, found.arity);
}

// A JavaScript function a Python module reached for, named in `importjs`. Python
// calls it with Python values, and the one thing JavaScript genuinely cannot use
// is a Python callable: it refuses arguments it never declared and answers in
// Python objects.
//
// So every callable argument crosses the boundary the way an exported function
// does, and everything else becomes plain data.
const outbound = (value) => (typeof value === 'function' ? pyHandler(value) : plainData(value));

// And what comes back. `jsobj2pyobj` is Brython's own machinery and it is
// conservative in exactly the way this needs: a number becomes an int or a
// float, a string a Python string, a DOM node a DOMNode — and everything else,
// plain objects and Promises included, is returned untouched. Without it, a
// value returned by an `importjs` function arrives as a raw JavaScript one, so
// `cubicOut(0.5)` cannot be rounded, formatted, or even multiplied.
const inbound = (value) => globalThis.__BRYTHON__.jsobj2pyobj(value);

// A proxy rather than a wrapper function, because the name has to stay the thing
// it was: its own properties, its prototype, `instanceof`, and construction with
// `new` all still reach the original. Only a call made through it is adapted —
// which matters here more than it did under Svelte, since the commonest
// `importjs` of all is a child **component**, and Vue must receive the very
// object the module exported.
export function jsCall(value) {
    if (typeof value !== 'function') return value;

    return new Proxy(value, {
        apply: (target, self, args) => inbound(Reflect.apply(target, self, args.map(outbound)))
    });
}

// A module's function, read from Python that lives somewhere else.
//
// `$B.imported` holds a plain JavaScript object, so Brython reads a foreign
// module's namespace as foreign and converts the arguments on the way in — a
// `dict` would arrive with only its subscript left. Undone rather than
// prevented: `pyobj2jsobj` records what it converted, so the original is there
// to hand back, and anything not in the record passes through untouched.
const boundaries = new WeakMap();

const restored = (value) => {
    if (value === null || typeof value !== 'object') return value;

    const original = globalThis.__BRYTHON__.$vuythonPyobj?.get(value);

    return original === undefined ? value : original;
};

export function pyBoundary(fn) {
    if (typeof fn !== 'function') return fn;

    // Memoised, because Python compares a function by identity: reading
    // `panier.ajouter` twice has to answer the same object.
    let wrapped = boundaries.get(fn);

    if (wrapped === undefined) {
        wrapped = (...args) => fn(...args.map(restored));

        // The wrapper stands in for the Python function, so it answers for it
        // too: `$function_infos` is where the name, the file and the declared
        // arity are read from, and losing them leaves every caller downstream
        // handing a Python signature more arguments than it takes.
        wrapped.$function_infos = fn.$function_infos;
        boundaries.set(fn, wrapped);
    }

    return wrapped;
}

// Hand Brython our namespace instead of the one it would have made for itself.
//
// The codegen opens every module body with `locals_X = $B.namespace('X')`, so
// intercepting that single call is enough — no rewriting of generated code. The
// name is checked because a module body may import others while it runs, and
// each import creates its own namespace through the same function.
export function withNamespace(name, namespace, run) {
    const $B = globalThis.__BRYTHON__;
    const original = $B.namespace;

    $B.namespace = (requested) => (requested === name ? namespace : original(requested));

    try {
        return run();
    } finally {
        $B.namespace = original;
    }
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

export function template(fn, where, lineOffset = 0) {
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
                // Free on everything else: `schedule` compares the class in
                // JavaScript and returns at once for a value that is not a
                // coroutine, which is every other template expression.
                return schedule(inTemplate(() => fn(...args)), where, lineOffset);
            } catch (error) {
                throw pyError(error, where, lineOffset);
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

export function pyDirective(name, lineOffset = 0) {
    const stop = (el) => {
        const previous = teardowns.get(el);

        if (typeof previous === 'function') previous();
        teardowns.delete(el);
    };

    const run = (el, binding) => {
        stop(el);

        const fn = binding.instance && binding.instance[name];
        const result = pyEvent(fn, lineOffset)(el, binding.value);

        if (typeof result === 'function') teardowns.set(el, pyEvent(result, lineOffset));
    };

    return { mounted: run, updated: run, unmounted: stop };
}

// A module's namespace, published under its Python module name, so another
// component's Python can `import` it and reach the very same refs.
export function registerModule(name, namespace) {
    globalThis.__BRYTHON__.imported[name] = namespace;
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
