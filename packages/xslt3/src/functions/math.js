/**
 * Trigonometric and exponential functions (F&O 3.1 section 4.8), in the
 * namespace http://www.w3.org/2005/xpath-functions/math. They follow IEEE
 * 754 (JS Math) except where F&O differs: math:pow(1, y) and
 * math:pow(-1, ±INF) are 1.
 *
 * @module @tradik/xslt3/functions/math
 */

import { define, doubleItem, MATH_NAMESPACE, toDouble } from "./support.js";

const D = "xs:double?";

/**
 * math:pow on JS numbers.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function pow(x, y) {
  if (x === 1 || (x === -1 && !Number.isFinite(y) && !Number.isNaN(y))) {
    return 1;
  }
  return x ** y;
}

/**
 * Declares a math function of one optional xs:double.
 * @param {string} local
 * @param {(x: number) => number} apply
 * @returns {import("./support.js").FunctionDefinition}
 */
const unary = (local, apply) =>
  define(
    local,
    [D],
    D,
    ([arg]) => (arg.length === 0 ? [] : [doubleItem(apply(arg[0].value))]),
    { namespace: MATH_NAMESPACE },
  );

/** @type {import("./support.js").FunctionDefinition[]} */
export const mathFunctions = [
  define("pi", [], "xs:double", () => [doubleItem(Math.PI)], {
    namespace: MATH_NAMESPACE,
  }),
  unary("exp", Math.exp),
  unary("exp10", (x) => 10 ** x),
  unary("log", Math.log),
  unary("log10", Math.log10),
  unary("sqrt", Math.sqrt),
  unary("sin", Math.sin),
  unary("cos", Math.cos),
  unary("tan", Math.tan),
  unary("asin", Math.asin),
  unary("acos", Math.acos),
  unary("atan", Math.atan),
  define(
    "pow",
    [D, "xs:numeric"],
    D,
    ([x, [y]]) =>
      x.length === 0 ? [] : [doubleItem(pow(x[0].value, toDouble(y)))],
    { namespace: MATH_NAMESPACE },
  ),
  define(
    "atan2",
    ["xs:double", "xs:double"],
    "xs:double",
    ([[y], [x]]) => [doubleItem(Math.atan2(y.value, x.value))],
    { namespace: MATH_NAMESPACE },
  ),
];
