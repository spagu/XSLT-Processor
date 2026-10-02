/**
 * The engines of the XSLT engine benchmark behind one interface, used by
 * xsltWorker.mjs. `load(context)` returns `compile()` (a reusable compiled
 * stylesheet) and `run(compiled)` (one transformation, serialized to a
 * string):
 *
 * - "1.0 package": @tradik/xslt-processor (src/): `new XSLTProcessor()` +
 *   `importStylesheet()`, then `transformToString()`;
 * - "xslt3": @tradik/xslt3 (packages/xslt3): `compileStylesheet()`, then
 *   `transform()` + `serialize()` with the stylesheet's output parameters;
 * - "saxon": SaxonJS 3 (`saxonjs-he`, optional, run locally only, never
 *   published; see docs/BENCHMARKS.md): the stylesheet is compiled to SEF
 *   beforehand by `xslt3-he` (timed by the runner); `compile()` reads the
 *   SEF, `run()` is `SaxonJS.transform(..., "sync")` on a tree SaxonJS
 *   parsed itself (untimed).
 *
 * @module scripts/benchmark/xsltEngines
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @typedef {Object} EngineContext
 * @property {string} root - Repository root
 * @property {string} dir - Input directory (in.xml, t.xsl, params.json)
 * @property {Document} [xml] - Parsed source (jsdom or xmldom)
 * @property {Document} [xsl] - Parsed stylesheet
 * @property {(text: string) => Document} [parse] - The DOM's XML parser
 * @property {Record<string, string>} params - String parameters
 * @property {string} [saxonDir] - Directory with saxonjs-he installed
 */

/** First line of the last console.error (the 1.0 package's failures). */
let lastError = null;

/**
 * Import a module of the repository.
 *
 * @param {string} root - Repository root
 * @param {string} path - Path below it
 * @returns {Promise<object>} The module
 */
const importFrom = (root, path) => import(pathToFileURL(join(root, path)).href);

/** @type {Readonly<Record<string, {load: (ctx: EngineContext) => Promise<{compile: () => *, run: (compiled: *) => string}>}>>} */
export const XSLT_ENGINE_ADAPTERS = Object.freeze({
  "1.0 package": {
    async load(ctx) {
      const { XSLTProcessor } = await importFrom(
        ctx.root,
        "src/XSLTProcessor.js",
      );
      console.error = (...parts) => {
        lastError = parts.map(String).join(" ").split("\n")[0];
      };
      return {
        compile() {
          const processor = new XSLTProcessor();
          processor.importStylesheet(ctx.xsl);
          for (const [name, value] of Object.entries(ctx.params)) {
            processor.setParameter(null, name, value);
          }
          return processor;
        },
        run(processor) {
          const output = processor.transformToString(ctx.xml);
          if (output === null) {
            throw new Error(lastError ?? "Transformation failed");
          }
          return output;
        },
      };
    },
  },
  xslt3: {
    async load(ctx) {
      const lib = await importFrom(ctx.root, "packages/xslt3/src/index.js");
      return {
        compile: () => lib.compileStylesheet(ctx.xsl, { parseXml: ctx.parse }),
        run(stylesheet) {
          const result = stylesheet.transform({
            source: ctx.xml,
            params: ctx.params,
          });
          return lib.serialize([result.principal].flat(), result.output);
        },
      };
    },
  },
  saxon: {
    async load(ctx) {
      const require = createRequire(join(ctx.saxonDir, "package.json"));
      const SaxonJS = require("saxonjs-he");
      const source = SaxonJS.XPath.evaluate("parse-xml($text)", null, {
        params: { text: readFileSync(join(ctx.dir, "in.xml"), "utf8") },
      });
      const sef = readFileSync(join(ctx.dir, "t.sef.json"), "utf8");
      return {
        compile: () => JSON.parse(sef),
        run(stylesheetInternal) {
          const result = SaxonJS.transform(
            {
              stylesheetInternal,
              sourceNode: source,
              destination: "serialized",
              stylesheetParams: ctx.params,
            },
            "sync",
          );
          return result.principalResult;
        },
      };
    },
  },
});

/**
 * File-name-safe form of an engine name ("1.0 package" → "1.0-package").
 *
 * @param {string} engine - Engine name
 * @returns {string} The slug
 */
export function engineSlug(engine) {
  return engine.replaceAll(/[^A-Za-z0-9.]+/g, "-");
}
