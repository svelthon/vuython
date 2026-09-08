import { createRequire } from 'node:module';
import { relative } from 'node:path';

import { overTemplate, pythonExpressions, collector, renameModels } from './markup.js';

const require = createRequire(import.meta.url);
const { compile, VIRTUAL_PREFIX } = require('./compile.cjs');

// Generated modules, keyed by component name. Filled when a component is
// transformed, read back when Vite resolves the import that transform just
// wrote into it.
const generated = (globalThis[Symbol.for('vuython.generated')] ??= new Map());

// Must be unique across the project *and* a valid JS identifier, since Brython
// derives its namespace binding (`locals_<name>`) from it.
const nameFor = (filename) => relative(process.cwd(), filename || 'Component').replace(/\W/g, '_');

const SCRIPT = /<script([^>]*)\blang=["']python["']([^>]*)>([\s\S]*?)<\/script>/i;

// Vue has no preprocessor hook. Svelte's `preprocess` is an API of the compiler
// itself, called before it parses; here the same place is a Vite plugin that
// runs `enforce: 'pre'`, so `@vitejs/plugin-vue` receives a component that is
// already ordinary JavaScript and never learns that Python was involved.
//
// Which is the more portable of the two, and worth saying plainly: what Svelthon
// needed from Svelte was a documented hook. What Vuython needs from Vue is
// nothing at all.
export function vuython() {
    return {
        name: 'vuython',
        enforce: 'pre',

        resolveId(id) {
            if (id.startsWith(VIRTUAL_PREFIX)) return '\0' + id;
        },

        load(id) {
            if (id.startsWith('\0' + VIRTUAL_PREFIX)) return generated.get(id.slice(1));
        },

        transform(code, id) {
            const file = id.split('?')[0];

            // The language of the template follows the language of the script,
            // with no third mode: a component without `lang="python"` is a
            // JavaScript component and stays one, exactly as a .js file is
            // untouched by TypeScript.
            if (!file.endsWith('.vue') || !SCRIPT.test(code)) return;

            const name = nameFor(file);
            const source = relative(process.cwd(), file);

            // Appended, never prepended: the Python's own line numbers stay
            // true, which is what keeps error messages pointing at the right
            // place.
            const defs = [];
            const withCalls = overTemplate(code, (markup) =>
                pythonExpressions(markup, collector(defs))
            );

            const script = SCRIPT.exec(withCalls);
            // Python line numbers count from the start of the <script> body,
            // whose first line is the remainder of the opening tag's own line.
            // So the gap to the file's numbering is the number of lines before
            // that tag.
            const lineOffset = withCalls.slice(0, script.index).split('\n').length - 1;

            const compiled = compile(script[3], name, source, {
                defs,
                lineOffset,
                title: (source.split('/').pop() || '').replace(/\.vue$/, '')
            });

            generated.set(VIRTUAL_PREFIX + name, compiled.module);

            // The content is JavaScript now, so the tag must stop claiming
            // otherwise: every tool downstream reads the attribute.
            const opened = `<script${script[1]}${script[2]}>`.replace(/\s+>/, '>');

            const out =
                withCalls.slice(0, script.index) +
                `${opened}\n${compiled.script}\n</script>` +
                withCalls.slice(script.index + script[0].length);

            // Which names travel both ways is only known once the script has
            // been read, so the one rewrite that depends on the surface happens
            // after it rather than in the markup pass.
            return {
                code: overTemplate(out, (markup) => renameModels(markup, compiled.bindables))
            };
        },

        // A component's generated code lives in its own module, which Vite has
        // no reason to tie to the .vue file that produced it. Without this,
        // editing the Python re-transforms the component but keeps serving the
        // previous generated body: the page updates to code that never changed.
        hotUpdate({ file, modules }) {
            const graph = this.environment.moduleGraph;
            const id = '\0' + VIRTUAL_PREFIX + nameFor(file);
            const stale = graph.getModuleById(id);

            if (!stale) return;

            graph.invalidateModule(stale);

            return [...modules, stale];
        }
    };
}
