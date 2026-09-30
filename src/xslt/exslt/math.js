/**
 * EXSLT math module (http://exslt.org/math), following libexslt `math.c`.
 *
 * - `min()` / `max()` are NaN for an empty node-set or when any node is NaN.
 * - `highest()` / `lowest()` are empty in the same cases.
 * - `constant(name, precision)` truncates the constant's decimal text to
 *   `precision` characters (the leading "3." of PI counts), NaN otherwise.
 * - Every numeric function returns NaN for a NaN argument.
 */

"use strict";

import { expandedFunctionName } from "../../xpath/evaluator.js";
import { parseXPathNumber } from "../../xpath/strings.js";
import {
  EXSLT_MATH,
  checkArity,
  inDocumentOrder,
  toNodeSet,
} from "./arguments.js";

/** Decimal text of the constants known to `math:constant()`. */
const CONSTANTS = Object.freeze({
  PI: "3.1415926535897932384626433832795028841971693993751",
  E: "2.71828182845904523536028747135266249775724709369996",
  SQRRT2: "1.41421356237309504880168872420969807856967187537694",
  LN2: "0.69314718055994530941723212145817656807550013436025",
  LN10: "2.30258509299404568402",
  LOG2E: "1.4426950408889634074",
  SQRT1_2: "0.70710678118654752440",
});

/**
 * `math:constant(name, precision)`.
 *
 * @param {string} name - Constant name, case-sensitive
 * @param {number} precision - Number of characters of the decimal text
 * @returns {number} The truncated constant, NaN for an unknown name
 */
export function mathConstant(name, precision) {
  if (Number.isNaN(precision) || precision < 1) return Number.NaN;
  if (!Object.hasOwn(CONSTANTS, name)) return Number.NaN;
  const text = CONSTANTS[name];
  return parseXPathNumber(
    text.substring(0, Math.min(text.length, Math.trunc(precision))),
  );
}

/**
 * `math:power(base, power)` with C `pow()` semantics: 1 raised to anything,
 * and -1 raised to an infinity, are 1 (JavaScript gives NaN).
 *
 * @param {number} base - The base
 * @param {number} power - The exponent
 * @returns {number} The power, NaN when either argument is NaN
 */
export function mathPower(base, power) {
  if (Number.isNaN(base) || Number.isNaN(power)) return Number.NaN;
  if (base === 1 || (base === -1 && !Number.isFinite(power))) return 1;
  return Math.pow(base, power);
}

/**
 * Extreme nodes of a node-set: those whose number is the best one.
 *
 * @param {number[]} values - Numbers of the nodes, in node order
 * @param {(a: number, b: number) => boolean} better - Whether a beats b
 * @returns {number[]} Indexes of the extreme nodes, empty when any is NaN
 */
function extremeIndexes(values, better) {
  if (values.length === 0 || values.some(Number.isNaN)) return [];
  let best = values[0];
  let indexes = [];
  values.forEach((value, index) => {
    if (better(value, best)) {
      best = value;
      indexes = [index];
    } else if (value === best) {
      indexes.push(index);
    }
  });
  return indexes;
}

/** One-argument numeric functions and their implementation. */
const UNARY = Object.freeze({
  abs: Math.abs,
  sqrt: Math.sqrt,
  log: Math.log,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  exp: Math.exp,
});

/**
 * Build the EXSLT math functions.
 *
 * @param {import('../../xpath/evaluator.js').XPathEvaluator} evaluator - Evaluates the arguments
 * @param {{random?: () => number}} [options] - `random` replaces `Math.random` (tests)
 * @returns {Object<string, Function>} Functions keyed by expanded name
 */
export function createMathFunctions(evaluator, options = {}) {
  const random = options.random ?? Math.random;
  const number = (arg, ctx) => evaluator.toNumber(evaluator.evaluate(arg, ctx));

  /**
   * Numbers of the nodes of a node-set argument, in document order.
   *
   * @param {string} name - Function name, for errors
   * @param {Array} args - Argument expressions
   * @param {object} ctx - Evaluation context
   * @returns {{nodes: Node[], values: number[]}} The nodes and their numbers
   */
  const numbered = (name, args, ctx) => {
    checkArity(name, args, 1);
    const nodes = inDocumentOrder(
      evaluator,
      toNodeSet(name, evaluator.evaluate(args[0], ctx)),
    );
    const values = nodes.map((node) =>
      evaluator.toNumber(evaluator.getStringValue(node)),
    );
    return { nodes, values };
  };

  const extremeValue = (name, better) => (args, ctx) => {
    const { values } = numbered(name, args, ctx);
    const indexes = extremeIndexes(values, better);
    return indexes.length === 0 ? Number.NaN : values[indexes[0]];
  };

  const extremeNodes = (name, better) => (args, ctx) => {
    const { nodes, values } = numbered(name, args, ctx);
    return extremeIndexes(values, better).map((index) => nodes[index]);
  };

  const less = (a, b) => a < b;
  const greater = (a, b) => a > b;
  const key = (local) => expandedFunctionName(EXSLT_MATH, local);

  const functions = {
    [key("min")]: extremeValue("math:min", less),
    [key("max")]: extremeValue("math:max", greater),
    [key("lowest")]: extremeNodes("math:lowest", less),
    [key("highest")]: extremeNodes("math:highest", greater),
    [key("constant")]: (args, ctx) => {
      checkArity("math:constant", args, 2);
      const name = evaluator.toString(evaluator.evaluate(args[0], ctx));
      return mathConstant(name, number(args[1], ctx));
    },
    [key("random")]: (args) => {
      checkArity("math:random", args, 0);
      return random();
    },
    [key("power")]: (args, ctx) => {
      checkArity("math:power", args, 2);
      return mathPower(number(args[0], ctx), number(args[1], ctx));
    },
    [key("atan2")]: (args, ctx) => {
      checkArity("math:atan2", args, 2);
      return Math.atan2(number(args[0], ctx), number(args[1], ctx));
    },
  };

  for (const [local, fn] of Object.entries(UNARY)) {
    functions[key(local)] = (args, ctx) => {
      checkArity(`math:${local}`, args, 1);
      return fn(number(args[0], ctx));
    };
  }

  return functions;
}
