/**
 * XPath 3.1: compile an expression once, evaluate it many times.
 *
 * ```js
 * import { compileXPath, evaluateXPath } from "@tradik/xslt3/xpath";
 * const expr = compileXPath("//item[@price > $min]", { variables: ["min"] });
 * expr.evaluate(document, { variables: { min: 10 } }); // [Element, ...]
 * evaluateXPath("sum(1 to 10)", null); // [AtomicValue xs:integer 55]
 * ```
 *
 * Results are arrays of XDM items: DOM nodes, AtomicValue (xdm/atomic.js),
 * XdmMap, XdmArray and FunctionItem (items/). JavaScript values given as
 * variables or context item are converted (see eval/values.js).
 *
 * @module @tradik/xslt3/xpath
 */

import { XPathError } from "../errors.js";
import { coreFunctions } from "../functions/core.js";
import {
  createFunctionLibrary,
  FunctionLibrary,
} from "../functions/registry.js";
import { compileNode, withinLimits } from "./eval/compiler.js";
import { createDescendantMemo } from "./eval/descendantMemo.js";
import { createDynamicContext } from "./eval/dynamicContext.js";
import { rootScope } from "./eval/scope.js";
import { createStaticContext, variableKey } from "./eval/staticContext.js";
import { toSequence } from "./eval/values.js";
import { parseXPath } from "./syntax/index.js";

/** The library of the built-in functions. */
export const defaultFunctionLibrary = createFunctionLibrary(coreFunctions);

/**
 * @typedef {object} StaticOptions
 * @property {object|Map|Array<{prefix: string, uri: string}>} [namespaces]
 *   - Prefix bindings added to the predeclared ones (xml, xs, xsi, fn,
 *   map, array, math, err); the prefix "" sets the default element namespace
 * @property {string} [defaultElementNamespace] - Default element/type namespace
 * @property {string} [defaultFunctionNamespace] - Default: the fn namespace
 * @property {string[]|object} [variables] - Names of the external
 *   variables (`name`, `prefix:name` or `Q{uri}name`), or an object whose
 *   keys are the names
 * @property {Array|FunctionLibrary} [functions] - Function definitions or
 *   modules (arrays of definitions) added to the built-in ones, or a
 *   complete library
 * @property {boolean} [backwardsCompatible] - XPath 1.0 compatibility mode
 * @property {string} [baseUri] - Static base URI
 * @property {string} [defaultCollation] - Only the codepoint collation
 * @property {Array<object>|object|Map} [decimalFormats] - Decimal formats
 *   for fn:format-number: an array of definitions with a `name` (none for
 *   the default format), or definitions by name; properties in camelCase
 *   or as xsl:decimal-format attribute names (see eval/decimalFormats.js)
 */

/**
 * @typedef {object} DynamicOptions
 * @property {object} [variables] - Values of the external variables by name
 * @property {number} [implicitTimezone] - Minutes, default 0 (UTC)
 * @property {Date|import("../xdm/datetime.js").DateTimeValue} [currentDateTime]
 * @property {(uri: string) => Node} [documentLoader] - Loads fn:doc URIs
 *   (absolute, resolved against the base URI)
 * @property {(uri: string) => (string|Uint8Array|ArrayBuffer|{content: string|Uint8Array|ArrayBuffer, encoding?: string, mediaType?: string})} [textLoader]
 *   - Loads the text resources of fn:unparsed-text, fn:unparsed-text-lines,
 *   fn:unparsed-text-available and fn:json-doc (absolute URIs, resolved
 *   against the base URI); bytes are decoded by BOM, `encoding` (external
 *   information), the XML declaration of an XML `mediaType`, the
 *   function's encoding argument, else UTF-8. Return null or throw when
 *   there is no resource (FOUT1170). Default: no resources at all;
 *   `readFileUri` (exported) reads `file:` URIs in Node.js, for trusted
 *   expressions only
 * @property {(text: string, baseUri?: string) => Document} [xmlParser]
 *   - Parses the strings of fn:parse-xml and fn:parse-xml-fragment; throws
 *   when the text is not well-formed. Default: `globalThis.DOMParser`,
 *   FODC0006 without it
 * @property {(uri: string|null) => Array|null} [collections] - The items
 *   of fn:collection by absolute URI (null: the default collection);
 *   fn:uri-collection gives their document URIs (xs:anyURI items are
 *   returned as they are). Null for an unknown collection (FODC0002).
 *   Default: no collections
 * @property {(value: Array, label: string) => void} [trace] - fn:trace output
 * @property {() => Document} [createDocument] - Creates the empty
 *   documents in which functions build new nodes (default: from the DOM of
 *   the context item, else of the global document)
 * @property {import("./eval/documentOrder.js").DocumentOrder} [documentOrder]
 *   - Document order cache to share between evaluations over unchanged trees
 */

/**
 * @param {StaticOptions["functions"]} functions
 * @returns {FunctionLibrary}
 */
function libraryOf(functions) {
  if (functions instanceof FunctionLibrary) return functions;
  if (!functions || functions.length === 0) return defaultFunctionLibrary;
  return defaultFunctionLibrary.extend(...functions);
}

/**
 * @param {string[]|object|undefined} variables
 * @returns {string[]} the variable names
 */
const variableNames = (variables) =>
  Array.isArray(variables) ? variables : Object.keys(variables ?? {});

/**
 * Compiles an XPath 3.1 expression.
 * @param {string} expression
 * @param {StaticOptions} [options]
 * @returns {{evaluate: (contextItem?: *, options?: DynamicOptions) => Array}}
 *   the compiled expression; `evaluate` takes the context item (undefined
 *   for none) and returns the result sequence
 * @throws {XPathError} static errors: XPST0003 (syntax), XPST0008,
 *   XPST0017, XPST0051, XPST0080, XPST0081...; XPDY0130 when the
 *   expression is nested too deeply
 */
export function compileXPath(expression, options = {}) {
  const sc = createStaticContext(options, libraryOf(options.functions));
  const keys = variableNames(options.variables).map((name) =>
    variableKey(name, sc),
  );
  const evaluator = withinLimits(() =>
    compileNode(parseXPath(expression), rootScope(sc, keys)),
  );
  return {
    evaluate(contextItem, dynamicOptions = {}) {
      const values = new Map();
      for (const [name, value] of Object.entries(
        dynamicOptions.variables ?? {},
      )) {
        values.set(variableKey(name, sc), toSequence(value));
      }
      let env = null;
      for (const key of keys) env = { value: values.get(key), next: env };
      const focus = toSequence(contextItem);
      if (focus.length > 1) {
        throw new XPathError("XPTY0004", "The context item must be one item");
      }
      const ctx = {
        item: focus[0],
        position: 1,
        size: 1,
        env,
        dyn: createDynamicContext(sc, dynamicOptions, focus[0]),
      };
      ctx.dyn.descendantMemo = createDescendantMemo();
      return withinLimits(() => evaluator(ctx));
    },
  };
}

/** Static options other than `variables`; any of them disables the cache. */
const STATIC_OPTIONS = [
  "namespaces",
  "defaultElementNamespace",
  "defaultFunctionNamespace",
  "functions",
  "backwardsCompatible",
  "baseUri",
  "defaultCollation",
  "decimalFormats",
];

/** Most compiled expressions kept by evaluateXPath. */
export const COMPILED_CACHE_SIZE = 64;

/** Compiled expressions of evaluateXPath by key, least recently used first. */
const compiledCache = new Map();

/**
 * The compiled expression of evaluateXPath, from a small LRU cache when
 * the only static option is `variables` (the names are part of the key):
 * other static options can be objects that change between calls, so their
 * expressions are compiled every time.
 * @param {string} expression
 * @param {StaticOptions} options
 * @returns {ReturnType<typeof compileXPath>}
 */
function compiledFor(expression, options) {
  const names = variableNames(options.variables);
  const compile = () =>
    compileXPath(expression, { ...options, variables: names });
  if (STATIC_OPTIONS.some((name) => options[name] !== undefined)) {
    return compile();
  }
  const key = JSON.stringify([expression, names]);
  let compiled = compiledCache.get(key);
  if (compiled) compiledCache.delete(key);
  else {
    compiled = compile();
    if (compiledCache.size >= COMPILED_CACHE_SIZE) {
      compiledCache.delete(compiledCache.keys().next().value);
    }
  }
  compiledCache.set(key, compiled);
  return compiled;
}

/**
 * Compiles and evaluates an expression; the names of `options.variables`
 * are the external variables. Without other static options, the compiled
 * expression is kept in a small LRU cache (COMPILED_CACHE_SIZE
 * expressions) and reused by the next calls with the same text and
 * variable names; for repeated evaluations, compileXPath once is still
 * the faster way.
 * @param {string} expression
 * @param {*} [contextItem] - Context item, undefined or null for none
 * @param {StaticOptions & DynamicOptions} [options]
 * @returns {Array} the result sequence
 */
export function evaluateXPath(expression, contextItem, options = {}) {
  return compiledFor(expression, options).evaluate(contextItem, options);
}

export { createFunctionLibrary, FunctionLibrary, XPathError };
export { readFileUri } from "./eval/resources.js";
