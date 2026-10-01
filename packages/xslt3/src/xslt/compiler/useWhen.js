/**
 * Static expressions (XSLT 3.0 section 9.7): use-when conditions, the
 * values of static variables and parameters, and shadow attributes,
 * evaluated at compile time in a restricted static context: the
 * namespaces in scope, the static variables declared before, the
 * standard functions and system-property(), function-available(),
 * element-available() and type-available(); no context item.
 *
 * @module @tradik/xslt3/xslt/compiler/useWhen
 */

import { defaultFunctionLibrary } from "../../xpath/index.js";
import { compileNode } from "../../xpath/eval/compiler.js";
import { createDynamicContext } from "../../xpath/eval/dynamicContext.js";
import { createStaticContext } from "../../xpath/eval/staticContext.js";
import { parseXPath } from "../../xpath/syntax/index.js";
import { effectiveBooleanValue } from "../../xdm/nodes.js";
import { standardAttr } from "../names.js";
import { availabilityFunctions } from "../runtime/availability.js";
import { simpleContent } from "../runtime/values.js";
import { parseAvt } from "./avt.js";
import { infoOf } from "./elementInfo.js";

const library = defaultFunctionLibrary.extend(availabilityFunctions);

/**
 * Evaluates a static expression written on a stylesheet element.
 * @param {string} text
 * @param {Element} element
 * @param {Map<string, Array>} statics - Static variables by Clark name
 * @returns {Array} the value
 */
export function evaluateStatic(text, element, statics) {
  const info = infoOf(element);
  const sc = createStaticContext(
    {
      namespaces: new Map(
        [...info.namespaces].filter(([prefix]) => prefix !== ""),
      ),
      defaultElementNamespace: info.xpathDefaultNs,
      baseUri: info.baseUri,
    },
    library,
  );
  let vars = null;
  let env = null;
  for (const [key, value] of statics) {
    vars = { key, next: vars };
    env = { value, next: env };
  }
  const run = compileNode(parseXPath(text), { sc, vars });
  const dyn = createDynamicContext(sc, {}, undefined);
  dyn.sc = sc;
  return run({ item: undefined, position: 0, size: 0, env, dyn });
}

/**
 * Evaluates a static attribute value template (shadow attributes).
 * @param {string} text
 * @param {Element} element
 * @param {Map<string, Array>} statics
 * @returns {string}
 */
export function evaluateStaticAvt(text, element, statics) {
  return parseAvt(text)
    .map((part) =>
      typeof part === "string"
        ? part
        : simpleContent(evaluateStatic(part.expr, element, statics), " "),
    )
    .join("");
}

/**
 * Evaluates the use-when condition of an element.
 * @param {Element} element
 * @param {Map<string, Array>} [statics] - Static variables in scope
 * @returns {boolean} true when the element is included
 */
export function useWhen(element, statics = new Map()) {
  const condition = standardAttr(element, "use-when");
  if (condition === undefined) return true;
  return effectiveBooleanValue(evaluateStatic(condition, element, statics));
}
