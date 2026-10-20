// An ordinary JavaScript module, reached from Python with `importjs`.
export const shout = (text) => `${String(text).toUpperCase()}!`;

// Takes a callable and calls it: what a Python function handed to JavaScript has
// to survive, since a Brython function refuses arguments it never declared and
// answers in Python objects.
export const twice = (fn, value) => `${fn(value)} ${fn(value)}`;

// A number, to check the value comes back as Python rather than as a raw
// JavaScript one — `half(1) * 2` raises JavascriptError if it does not.
export const half = (n) => n / 2;

// A promise, for the one thing an `async def` exists to do.
export const delay = (value, ms) =>
    new Promise((resolve) => setTimeout(() => resolve(value), ms));

export const fail = (why) => Promise.reject(new Error(why));

export default (name) => `default:${name}`;
