/**
 * The two XPath engines of the XPath benchmark behind one interface, and
 * the engine-neutral description of their results used by the correctness
 * pre-check.
 *
 * - "1.0 package": XPath 1.0 of @tradik/xslt-processor (src/). Compiling is
 *   `parseXPath()`; an evaluation is a new `XPathEvaluator` and
 *   `XPathContext` over the parsed tree, which is what `evaluateXPath()`
 *   does after parsing. Results are JS numbers, strings, booleans or node
 *   arrays.
 * - "xslt3": XPath 3.1 of @tradik/xslt3 (packages/xslt3). Compiling is
 *   `compileXPath()`, an evaluation `compiled.evaluate(node)`. Results are
 *   arrays of XDM items: nodes, atomic values `{type, value}` (xs:integer
 *   as BigInt, xs:decimal as a Decimal), maps, arrays, functions.
 *
 * The 1.0 package caps a node-set at `XPathLimits.MAX_RESULT_SIZE` (10,000)
 * by default, a guard for untrusted expressions; `evaluateXPath()` takes
 * no option for it, so the benchmark raises the exported limit to the
 * XSLT engine's bound (5,000,000) for both the compiled and one-shot runs.
 *
 * Neither engine keeps state between evaluations here (each builds its own
 * document order index), so both pay the same per-call set-up.
 *
 * @module scripts/benchmark/xpathEngines
 */

import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Engine names in legend order. */
export const ENGINE_ORDER = Object.freeze(["1.0 package", "xslt3"]);

/**
 * @typedef {Object} Engine
 * @property {string} entry - Module path relative to the repository root
 * @property {(lib: object) => void} [configure] - Called once after loading
 * @property {(lib: object, expression: string) => (node: Node) => *} compile
 *   - Compile once, returning the evaluation function
 * @property {(lib: object, expression: string, node: Node) => *} oneShot
 *   - Compile and evaluate in one call
 */

/** @type {Readonly<Record<string, Engine>>} */
export const ENGINES = Object.freeze({
  "1.0 package": {
    entry: "src/index.js",
    configure(lib) {
      lib.XPathLimits.MAX_RESULT_SIZE = 5000000;
    },
    compile(lib, expression) {
      const ast = lib.parseXPath(expression);
      return (node) =>
        new lib.XPathEvaluator().evaluate(
          ast,
          new lib.XPathContext(node, 1, 1, {}, {}),
        );
    },
    oneShot: (lib, expression, node) => lib.evaluateXPath(expression, node),
  },
  xslt3: {
    entry: "packages/xslt3/src/index.js",
    compile(lib, expression) {
      const compiled = lib.compileXPath(expression);
      return (node) => compiled.evaluate(node);
    },
    oneShot: (lib, expression, node) => lib.evaluateXPath(expression, node),
  },
});

/**
 * Import an engine's module.
 *
 * @param {string} root - Repository root
 * @param {string} name - Engine name (ENGINES key)
 * @returns {Promise<object>} The module namespace
 */
export async function loadEngine(root, name) {
  const engine = ENGINES[name];
  const lib = await import(pathToFileURL(join(root, engine.entry)).href);
  engine.configure?.(lib);
  return lib;
}

/**
 * Engine-neutral key of one item: `name#id` for a node (the `id` attribute
 * when there is one), the value as a string for an atomic value (numbers of
 * any XDM numeric type compare by their JS number), `map(n)`, `array(n)`.
 *
 * @param {*} item - A 1.0 value, a node, or an XDM item
 * @returns {string} The key
 */
export function itemKey(item) {
  if (item === null || typeof item !== "object") return String(item);
  if (typeof item.nodeType === "number") {
    const id = item.nodeType === 1 ? item.getAttribute("id") : null;
    return id ? `${item.nodeName}#${id}` : item.nodeName;
  }
  if ("type" in item && "value" in item) {
    const { value } = item;
    if (typeof value === "bigint") return String(Number(value));
    if (value !== null && typeof value === "object") {
      return String(Number(value.toString()));
    }
    return String(value);
  }
  if (Array.isArray(item.members)) return `array(${item.members.length})`;
  if (item.size !== undefined) return `map(${item.size})`;
  return "function";
}

/**
 * Keys of a result: one per item of a sequence or node-set, one for a 1.0
 * number, string or boolean.
 *
 * @param {*} result - What an engine returned
 * @returns {string[]} The keys
 */
export function resultKeys(result) {
  return Array.isArray(result) ? result.map(itemKey) : [itemKey(result)];
}

/**
 * 32-bit FNV-1a hash of a string, as 8 hex digits.
 *
 * @param {string} text - Text
 * @returns {string} The hash
 */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * @typedef {Object} ResultSummary
 * @property {number} items - Items over all evaluations
 * @property {string} hash - Hash of every key, in order, per evaluation
 * @property {string} preview - The first keys, for reports
 */

/**
 * Summary of the results of one or more evaluations (one per context).
 *
 * @param {Array<*>} results - The result of each evaluation
 * @returns {ResultSummary} The summary
 */
export function summarizeResults(results) {
  const perRun = results.map(resultKeys);
  const all = perRun.flat();
  const clip = (key) => (key.length > 24 ? `${key.slice(0, 24)}...` : key);
  const shown = all.slice(0, 3).map(clip).join(", ");
  return {
    items: all.length,
    hash: fnv1a(perRun.map((keys) => keys.join("\u0001")).join("\u0002")),
    preview: all.length > 3 ? `${shown}, ...` : shown,
  };
}
