/**
 * Engine adapters: what the runners call to parse, evaluate, transform and
 * serialize. Every capability is optional; a test that needs a missing one
 * is reported "not-run".
 *
 * ```js
 * {
 *   name: "xslt3",
 *   parse(expr, staticContext),          // throws Error with .code
 *   evaluateXPath(expr, context),        // returns a sequence, throws .code
 *   transform(stylesheet, input, params),// returns {value, messages, resultDocuments}
 *   serialize(result, params),           // returns a string, throws .code
 * }
 * ```
 *
 * A sequence is an array of items (or a single item); an atomic item gives
 * its JavaScript value with `valueOf()`. `context` has `variables` (name to
 * value, `result` for assertions), `contextItem`, `namespaces`,
 * `environment` and `staticBaseUri`.
 *
 * @module test-suites/lib/adapter
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { confinePath } from "../../../../scripts/lib/fsSafety.mjs";
import { NotRunError } from "./assertions.mjs";

/** Parser module of @tradik/xslt3, loaded when it exists. */
export const PARSER_MODULE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "xpath",
  "syntax",
  "index.js",
);

/**
 * Load the default adapter (the @tradik/xslt3 XPath parser when present,
 * else an adapter without capabilities) or an adapter module given on the
 * command line (its default export, or the module namespace).
 *
 * @param {string} [modulePath] - Path of an adapter module
 * @param {string} [parserModule] - Parser module path (for tests)
 * @returns {Promise<object>} The adapter
 */
export async function loadAdapter(modulePath, parserModule = PARSER_MODULE) {
  if (modulePath) {
    const module = await import(pathToFileURL(confinePath(modulePath)).href);
    return module.default ?? module;
  }
  if (!existsSync(parserModule)) return { name: "none" };
  const { parseXPath } = await import(pathToFileURL(parserModule).href);
  if (typeof parseXPath !== "function") return { name: "none" };
  return {
    name: "xslt3-parser",
    parse: (expr, staticContext) => parseXPath(expr, staticContext),
  };
}

/**
 * First item of a sequence.
 *
 * @param {*} sequence - Array of items or a single item
 * @returns {*} The item, undefined for an empty sequence
 */
function firstItem(sequence) {
  return Array.isArray(sequence) ? sequence[0] : sequence;
}

/**
 * JavaScript boolean of a sequence holding one xs:boolean.
 *
 * @param {*} sequence - Engine sequence
 * @returns {boolean} The value
 */
export function toBoolean(sequence) {
  const item = firstItem(sequence);
  return item == null ? false : Boolean(item.valueOf());
}

/**
 * JavaScript string of a sequence holding one xs:string.
 *
 * @param {*} sequence - Engine sequence
 * @returns {string} The value, "" for an empty sequence
 */
export function toText(sequence) {
  const item = firstItem(sequence);
  return item == null ? "" : String(item.valueOf());
}

/**
 * Build the assertion helpers of a test from an adapter.
 *
 * @param {object} adapter - Engine adapter
 * @param {object} [options] - Options
 * @param {{prefix: string, uri: string}[]} [options.namespaces] - Namespaces
 *   of the test environment, in scope for assertion expressions
 * @param {boolean} [options.resultAsContext] - Also make the result the
 *   context item (xslt30-test assertions use paths like `/out`)
 * @param {(path: string) => string} options.readFile - File reader
 * @returns {import('./assertions.mjs').Helpers} The helpers
 */
export function createHelpers(
  adapter,
  { namespaces = [], resultAsContext = false, readFile },
) {
  const evaluate = (expr, value) => {
    if (!adapter.evaluateXPath) {
      throw new NotRunError("adapter has no evaluateXPath");
    }
    const context = { variables: { result: value }, namespaces };
    if (resultAsContext) context.contextItem = value;
    return adapter.evaluateXPath(expr, context);
  };
  return {
    test: (expr, value) => toBoolean(evaluate(expr, value)),
    stringValue: (value) =>
      toText(
        evaluate(
          `string-join(for $item in $result return string($item), ' ')`,
          value,
        ),
      ),
    serialize: (value, params) => {
      if (!adapter.serialize) throw new NotRunError("adapter has no serialize");
      return adapter.serialize(value, params);
    },
    readFile,
  };
}
