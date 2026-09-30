/**
 * Standalone binaries - CLI bundle
 *
 * Bundles bin/xslt.js, the library, jsdom and @xmldom/xmldom into one
 * CommonJS file that a Node.js Single Executable Application (SEA) runs. A
 * SEA main script can only `require()` built-in modules and has no files
 * next to it, so every module and data file is inlined and a few
 * module-load-time lookups are rewritten (each rewrite fails the build
 * loudly when its target changes):
 *
 * - bin/lib/options.js reads the version through a createRequire()-made
 *   `require("../../package.json")`: replaced by the version string.
 * - bin/lib/dom.js loads jsdom and @xmldom/xmldom with literal `import()`
 *   specifiers, which esbuild follows: both are bundled (XSLT_DOM picks one).
 * - jsdom reads browser/default-stylesheet.css relative to `__dirname`:
 *   the file content is inlined.
 * - jsdom calls `require.resolve("./xhr-sync-worker.js")` when it loads
 *   (only synchronous XMLHttpRequest uses the worker, the CLI never does):
 *   replaced by a placeholder path.
 * - css-tree's ESM build loads its data with createRequire(import.meta.url):
 *   all imports use its CommonJS build instead. Any other `import.meta` left
 *   in the bundle fails the build (it would be empty at run time).
 * - `canvas`, an optional jsdom peer dependency loaded inside try/catch,
 *   stays external, so jsdom runs without canvas support.
 */

import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ROOT_DIR } from "./targets.mjs";

/** `fs.readFileSync(path.resolve(__dirname, "<file>"), <options>)` calls. */
const DIRNAME_READ =
  /fs\.readFileSync\(\s*path\.resolve\(__dirname,\s*"([^"]+)"\)\s*,\s*\{[^}]*\}\s*\)/g;

/**
 * Packages whose ESM build reads data with `createRequire(import.meta.url)`
 * (empty in a CommonJS bundle): every import of them resolves to their
 * CommonJS build instead, which esbuild can inline.
 */
const REQUIRE_BUILD_PACKAGES = /^css-tree(\/|$)/;

/** Marks the nested resolve of {@link REQUIRE_BUILD_PACKAGES}. */
const RESOLVING = Symbol("single-executable-resolving");

/** `require.resolve("<file>")` calls. */
const REQUIRE_RESOLVE = /require\.resolve\(\s*"([^"]+)"\s*\)/g;

/**
 * Apply literal replacements, failing when one of them no longer matches.
 *
 * @param {string} source - Module source
 * @param {string} label - Module name used in errors
 * @param {Array<[string, string]>} replacements - [search, replacement] pairs
 * @returns {string} The patched source
 * @throws {Error} When a search string is missing (the source changed)
 *
 * @example
 * patchSource('a(b)', 'x.js', [['(b)', '(c)']]); // 'a(c)'
 */
export function patchSource(source, label, replacements) {
  return replacements.reduce((text, [search, replacement]) => {
    if (!text.includes(search)) {
      throw new Error(`${label}: cannot find "${search}" to patch`);
    }
    return text.replace(search, replacement);
  }, source);
}

/**
 * Rewrites of the CLI modules, keyed by path relative to the repository.
 *
 * @param {string} version - Package version
 * @returns {Record<string, Array<[string, string]>>} Replacements per module
 */
export function cliPatches(version) {
  return {
    "bin/lib/options.js": [
      ['import { createRequire } from "node:module";', ""],
      ["const require = createRequire(import.meta.url);", ""],
      ['require("../../package.json").version', JSON.stringify(version)],
    ],
  };
}

/**
 * Inline the files a module reads relative to `__dirname` and neutralize
 * `require.resolve` calls, which a single executable cannot satisfy.
 *
 * @param {string} source - CommonJS module source
 * @param {string} file - Absolute path of the module
 * @returns {string} The patched source
 */
export function inlineDirnameReads(source, file) {
  return source
    .replace(DIRNAME_READ, (_, relative) =>
      JSON.stringify(readFileSync(join(dirname(file), relative), "utf8")),
    )
    .replace(REQUIRE_RESOLVE, (_, relative) =>
      JSON.stringify(`/standalone-binary-unavailable/${relative}`),
    );
}

/**
 * esbuild plugin applying {@link cliPatches} and {@link inlineDirnameReads}.
 *
 * @param {string} version - Package version
 * @returns {import("esbuild").Plugin} The plugin
 */
function singleExecutablePlugin(version) {
  const patches = cliPatches(version);
  return {
    name: "single-executable",
    setup(builder) {
      builder.onResolve({ filter: REQUIRE_BUILD_PACKAGES }, (args) =>
        args.kind === "require-call" || args.pluginData === RESOLVING
          ? undefined
          : builder.resolve(args.path, {
              kind: "require-call",
              importer: args.importer,
              resolveDir: args.resolveDir,
              pluginData: RESOLVING,
            }),
      );
      builder.onLoad(
        { filter: /[\\/]bin[\\/]lib[\\/].*\.js$/ },
        async (args) => {
          const relative = args.path
            .slice(ROOT_DIR.length + 1)
            .replaceAll("\\", "/");
          const source = await readFile(args.path, "utf8");
          const contents = patches[relative]
            ? patchSource(source, relative, patches[relative])
            : source;
          return { contents, loader: "js" };
        },
      );
      builder.onLoad(
        { filter: /[\\/]node_modules[\\/]jsdom[\\/].*\.js$/ },
        async (args) => ({
          contents: inlineDirnameReads(
            await readFile(args.path, "utf8"),
            args.path,
          ),
          loader: "js",
        }),
      );
    },
  };
}

/**
 * Bundle the CLI, the library, jsdom and xmldom into a single CommonJS file.
 *
 * @param {string} outfile - Absolute path of the bundle to write
 * @returns {Promise<{bytes: number, version: string}>} Bundle size and the
 *   package version baked into it
 */
export async function bundleCli(outfile) {
  const { version } = JSON.parse(
    await readFile(join(ROOT_DIR, "package.json"), "utf8"),
  );
  const result = await build({
    entryPoints: [join(ROOT_DIR, "bin", "xslt.js")],
    outfile,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: ["node22"],
    minify: true,
    legalComments: "eof",
    external: ["canvas"],
    plugins: [singleExecutablePlugin(version)],
    metafile: true,
    logLevel: "warning",
    logOverride: { "empty-import-meta": "error" },
  });
  const [output] = Object.values(result.metafile.outputs);
  return { bytes: output.bytes, version };
}
