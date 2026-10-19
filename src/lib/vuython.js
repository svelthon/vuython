import { createRequire } from 'node:module';
import { relative, resolve, dirname } from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';

// Bryntime's engine, started before the compiler adds its parsing chain to it.
import 'bryntime';
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

// The generated module, behind the imports it needs evaluated first.
//
// A source map's `mappings` is delta-encoded per generated line, lines separated
// by `;`, so the prelude costs one `;` per line it adds — get that wrong and a
// debugger opens the file that many lines off. A module importing nothing is
// left alone rather than gaining an empty first line.
function withPrelude(module, map, prelude) {
    if (!prelude) return { code: module, map };

    const lead = `${prelude}\n`;
    const lines = lead.split('\n').length - 1;

    return { code: lead + module, map: { ...map, mappings: ';'.repeat(lines) + map.mappings } };
}

// Vue has no preprocessor hook. Svelte's `preprocess` is an API of the compiler
// itself, called before it parses; here the same place is a Vite plugin that
// runs `enforce: 'pre'`, so `@vitejs/plugin-vue` receives a component that is
// already ordinary JavaScript and never learns that Python was involved.
//
// Which is the more portable of the two, and worth saying plainly: what Svelthon
// needed from Svelte was a documented hook. What Vuython needs from Vue is
// nothing at all.
export function vuython(options = {}) {
    // Mirrors PYTHONPATH: the directories searched for the `.py` a component
    // imports, after its own. Without it, `import panier` only ever resolves to
    // a sibling file — and a component that reached the module some other way
    // would appear to work purely by load order.
    const searchPath = options.path || [];

    // A `.py` is served on every request in dev, and compiling Python is the
    // expensive half. Keyed on mtime, so an edit still recompiles.
    const modules = new Map();

    const compileModule = (file) => {
        const stamp = statSync(file).mtimeMs;
        const cached = modules.get(file);

        if (cached && cached.stamp === stamp) return cached.result;

        const source = readFileSync(file, 'utf8');
        const result = compile(source, nameFor(file), relative(process.cwd(), file), {
            module: true,
            sourceContent: source
        });

        modules.set(file, { stamp, result });
        return result;
    };

    // `import panier` → the file it names, looked up in the importer's own
    // directory first, then along the configured path.
    const pythonImports = (names, fromDirectory) =>
        names
            .flatMap(
                (one) =>
                    [fromDirectory, ...searchPath]
                        .map((directory) => resolve(directory, `${one}.py`))
                        .find((candidate) => existsSync(candidate)) || []
            )
            .map((path) => `import ${JSON.stringify(path)};`)
            .join('\n');

    return {
        name: 'vuython',
        enforce: 'pre',

        resolveId(id, importer) {
            if (id.startsWith(VIRTUAL_PREFIX)) return '\0' + id;

            // 'pre' matters here: Vite's own resolver would otherwise claim
            // `./panier.py` as a plain file and hand its Python to the JS parser.
            if (id.endsWith('.py') && (id.startsWith('.') || id.startsWith('/'))) {
                const direct = importer ? resolve(dirname(importer), id) : resolve(id);

                if (existsSync(direct)) return direct;
            }
        },

        load(id) {
            if (id.startsWith('\0' + VIRTUAL_PREFIX)) {
                const entry = generated.get(id.slice(1));

                return entry && (entry.map ? { code: entry.code, map: entry.map } : entry.code);
            }
            if (!id.endsWith('.py')) return;

            const { script, module, map, imports } = compileModule(id);

            // A `.py` may import another one. Same prelude a component gets: the
            // imported namespaces have to be registered before init() runs.
            generated.set(
                VIRTUAL_PREFIX + nameFor(id),
                withPrelude(module, map, pythonImports(imports, dirname(id)))
            );

            this.addWatchFile(id);
            return script;
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
                title: (source.split('/').pop() || '').replace(/\.vue$/, ''),
                // The whole file, so a debugger opens the .vue itself rather
                // than the fragment between its script tags.
                sourceContent: code
            });

            generated.set(
                VIRTUAL_PREFIX + name,
                withPrelude(compiled.module, compiled.map, pythonImports(compiled.imports, dirname(file)))
            );

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
