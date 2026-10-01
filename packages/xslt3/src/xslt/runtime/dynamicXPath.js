/**
 * The target expressions of xsl:evaluate (XSLT 3.0 sections 10.4.1 and
 * 10.4.2): compiled at run time against a static context built from the
 * instruction (or from the namespace-context node), without the
 * XSLT-defined functions and the stylesheet variables, and cached per
 * instruction.
 *
 * @module @tradik/xslt3/xslt/runtime/dynamicXPath
 */

import { FunctionLibrary } from "../../functions/registry.js";
import { compileNode, withinLimits } from "../../xpath/eval/compiler.js";
import { inScopeNamespaces } from "../../xpath/eval/namespaceNodes.js";
import { createStaticContext } from "../../xpath/eval/staticContext.js";
import { parseXPath } from "../../xpath/syntax/index.js";
import { xsltError } from "../names.js";
import { xsltFunctions } from "./functions.js";

/** @type {WeakMap<FunctionLibrary, FunctionLibrary>} */
const libraries = new WeakMap();

/**
 * The functions of a target expression: those of the stylesheet less
 * the XSLT-defined ones (key(), current-group(), system-property()...).
 * @param {FunctionLibrary} library - The library of the stylesheet
 * @returns {FunctionLibrary}
 */
function targetLibrary(library) {
  let result = libraries.get(library);
  if (!result) {
    const xslt = new Set(xsltFunctions);
    const hidden = (d) =>
      d.visibility === "private" || d.visibility === "hidden";
    result = new FunctionLibrary(
      library.definitions.filter((d) => !xslt.has(d) && !hidden(d)),
    );
    libraries.set(library, result);
  }
  return result;
}

/**
 * The namespaces of a namespace-context node: its in-scope namespaces,
 * the default one as the default element namespace.
 * @param {Node} node
 * @returns {{namespaces: Map<string, string>, defaultElementNamespace: string}}
 */
export function nodeNamespaces(node) {
  const bindings = node.nodeType === 1 ? inScopeNamespaces(node) : new Map();
  const defaultElementNamespace = bindings.get("") ?? "";
  bindings.delete("");
  return { namespaces: bindings, defaultElementNamespace };
}

/**
 * Compiles a target expression.
 * @param {string} text
 * @param {object} context - `{namespaces, defaultElementNamespace,
 *   baseUri, library, decimalFormats}`
 * @param {string[]} keys - Clark names of the variables, outermost first
 * @returns {(ctx: object) => Array} the evaluator
 * @throws {import("../../errors.js").XPathError} XTDE3160 for a static
 *   error in the expression
 */
export function compileTarget(text, context, keys) {
  try {
    const sc = createStaticContext(
      {
        namespaces: context.namespaces,
        defaultElementNamespace: context.defaultElementNamespace,
        baseUri: context.baseUri,
        decimalFormats: context.decimalFormats,
      },
      targetLibrary(context.library),
    );
    let vars = null;
    for (const key of keys) vars = { key, next: vars };
    const run = withinLimits(() => compileNode(parseXPath(text), { sc, vars }));
    return Object.assign(run, { sc });
  } catch (error) {
    // an undeclared variable keeps its code: the parameters vary per call
    if (typeof error?.code !== "string" || error.code === "XPST0008") {
      throw error;
    }
    throw xsltError(
      "XTDE3160",
      `Invalid expression "${text}" in xsl:evaluate: ${error.message}`,
    );
  }
}
