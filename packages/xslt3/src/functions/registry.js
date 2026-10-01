/**
 * The function library: definitions of built-in or extension functions,
 * looked up by expanded name and arity.
 *
 * Function modules export arrays of definitions:
 *
 * ```js
 * export const stringFunctions = [{
 *   local: "upper-case",
 *   params: ["xs:string?"],
 *   returns: "xs:string",
 *   impl: ([arg]) => [stringItem((arg[0]?.value ?? "").toUpperCase())],
 * }];
 * ```
 *
 * The evaluator applies the function conversion rules (atomization,
 * xs:untypedAtomic casting, numeric promotion, cardinality checks) to the
 * arguments before calling `impl`, so `impl` receives sequences of the
 * declared types.
 *
 * @module @tradik/xslt3/functions/registry
 */

import { NS } from "./signatures.js";

/**
 * @typedef {object} FunctionDefinition
 * @property {string} [namespace] - Default
 *   "http://www.w3.org/2005/xpath-functions"; math:
 *   ".../xpath-functions/math", map: ".../xpath-functions/map", array:
 *   ".../xpath-functions/array"
 * @property {string} local - Local name, e.g. "upper-case"
 * @property {string[]} params - Parameter sequence types in XPath syntax,
 *   e.g. ["xs:string?", "item()*"]; the arity is params.length
 * @property {string} returns - Result sequence type
 * @property {boolean} [variadic] - The last parameter repeats (fn:concat):
 *   any arity from params.length up is accepted
 * @property {boolean} [focus] - Needs the focus (context item, position,
 *   size)
 * @property {(args: Array<Array>, context: DynamicContext) => Array} impl
 *   - Implementation: one sequence per argument, returns a sequence
 */

/**
 * The context passed to implementations.
 * @typedef {object} DynamicContext
 * @property {number} implicitTimezone - Minutes
 * @property {import("../xdm/datetime.js").DateTimeValue} currentDateTime
 * @property {string} defaultCollation - Collation URI
 * @property {string|undefined} staticBaseUri
 * @property {string} defaultLanguage - "en"
 * @property {*} contextItem - Focus (focus functions only), undefined when
 *   absent
 * @property {number} position
 * @property {number} size
 * @property {(uri: string) => Node} loadDocument - Loads a document
 *   (FODC0002 when it cannot)
 */

/** A set of function definitions. */
export class FunctionLibrary {
  /**
   * @param {FunctionDefinition[]} definitions - Later definitions replace
   *   earlier ones of the same name and arity
   */
  constructor(definitions) {
    /** @type {Map<string, {fixed: Map<number, FunctionDefinition>, variadic: FunctionDefinition[]}>} */
    this.byName = new Map();
    this.definitions = definitions;
    for (const definition of definitions) {
      const key = FunctionLibrary.key(
        definition.namespace ?? NS.fn,
        definition.local,
      );
      let entry = this.byName.get(key);
      if (!entry) {
        entry = { fixed: new Map(), variadic: [] };
        this.byName.set(key, entry);
      }
      if (definition.variadic) entry.variadic.push(definition);
      else entry.fixed.set(definition.params.length, definition);
    }
  }

  /**
   * @param {string} namespace
   * @param {string} local
   * @returns {string} lookup key (Clark notation)
   */
  static key(namespace, local) {
    return `{${namespace}}${local}`;
  }

  /**
   * @param {string} namespace - Namespace URI
   * @param {string} local - Local name
   * @param {number} arity - Number of arguments
   * @returns {FunctionDefinition|null} the definition, null when unknown
   */
  lookup(namespace, local, arity) {
    const entry = this.byName.get(FunctionLibrary.key(namespace, local));
    if (!entry) return null;
    const fixed = entry.fixed.get(arity);
    if (fixed) return fixed;
    for (let i = entry.variadic.length - 1; i >= 0; i--) {
      if (arity >= entry.variadic[i].params.length) return entry.variadic[i];
    }
    return null;
  }

  /**
   * @param {...FunctionDefinition[]} definitionArrays - More modules
   * @returns {FunctionLibrary} a library with these definitions added
   */
  extend(...definitionArrays) {
    return new FunctionLibrary([
      ...this.definitions,
      ...definitionArrays.flat(),
    ]);
  }
}

/**
 * Creates a function library from modules.
 * @param {...FunctionDefinition[]} definitionArrays - Arrays of definitions
 * @returns {FunctionLibrary}
 * @example createFunctionLibrary(coreFunctions, stringFunctions)
 */
export function createFunctionLibrary(...definitionArrays) {
  return new FunctionLibrary(definitionArrays.flat());
}
