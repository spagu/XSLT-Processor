/**
 * Shared helpers of the function modules: namespaces, a compact way to
 * declare {@link FunctionDefinition}s and constructors of the atomic
 * results the functions return.
 *
 * @module @tradik/xslt3/functions/support
 */

import { XPathError } from "../errors.js";
import { AtomicValue } from "../xdm/atomic.js";
import { Decimal } from "../xdm/decimal.js";
import { stringValue } from "../xdm/nodes.js";
import { types } from "../xdm/types.js";

/** Namespace of the standard functions (prefix fn). */
export const FN_NAMESPACE = "http://www.w3.org/2005/xpath-functions";
/** Namespace of the math functions (prefix math). */
export const MATH_NAMESPACE = "http://www.w3.org/2005/xpath-functions/math";

/**
 * A built-in function of one arity, as consumed by the function registry.
 * @typedef {object} FunctionDefinition
 * @property {string} [namespace] - Defaults to {@link FN_NAMESPACE}
 * @property {string} local - Local name, e.g. "upper-case"
 * @property {string[]} params - Parameter sequence types, e.g. ["xs:string?"]
 * @property {string} returns - Result sequence type
 * @property {boolean} [variadic] - The last parameter repeats
 * @property {boolean} [focus] - Needs the focus (context item, position, size)
 * @property {(args: Array<Array<*>>, context: object) => Array<*>} impl
 */

/**
 * Declares a function of the fn namespace.
 * @param {string} local
 * @param {string[]} params
 * @param {string} returns
 * @param {FunctionDefinition["impl"]} impl
 * @param {Partial<FunctionDefinition>} [extra] - namespace, focus, variadic
 * @returns {FunctionDefinition}
 */
export function define(local, params, returns, impl, extra = {}) {
  return Object.freeze({
    namespace: FN_NAMESPACE,
    local,
    params,
    returns,
    impl,
    ...extra,
  });
}

/** @param {string} s @returns {AtomicValue} an xs:string */
export const stringItem = (s) => new AtomicValue(types.string, s);
/** @param {boolean} b @returns {AtomicValue} an xs:boolean */
export const booleanItem = (b) => new AtomicValue(types.boolean, b);
/** @param {number} n @returns {AtomicValue} an xs:double */
export const doubleItem = (n) => new AtomicValue(types.double, n);
/** @param {bigint|number} n @returns {AtomicValue} an xs:integer */
export const integerItem = (n) => new AtomicValue(types.integer, BigInt(n));
/** @param {Decimal} d @returns {AtomicValue} an xs:decimal */
export const decimalItem = (d) => new AtomicValue(types.decimal, d);

/**
 * @param {number} cp
 * @returns {boolean} whether the codepoint is an XML 1.0 Char
 */
export const isXmlChar = (cp) =>
  cp === 0x9 ||
  cp === 0xa ||
  cp === 0xd ||
  (cp >= 0x20 && cp <= 0xd7ff) ||
  (cp >= 0xe000 && cp <= 0xfffd) ||
  (cp >= 0x10000 && cp <= 0x10ffff);

/**
 * The string of an optional xs:string argument ("" for the empty sequence).
 * @param {Array<AtomicValue>} sequence
 * @returns {string}
 */
export const stringArg = (sequence) => sequence[0]?.value ?? "";

/**
 * Numeric value of an atomic number as a JS double.
 * @param {AtomicValue} item - xs:integer, xs:decimal, xs:float or xs:double
 * @returns {number}
 */
export function toDouble(item) {
  const { value } = item;
  if (typeof value === "number") return value;
  return value instanceof Decimal ? value.toNumber() : Number(value);
}

/**
 * String value of the context item, for the zero-argument forms that
 * default to it (fn:normalize-space(), fn:string-length()).
 * @param {{contextItem?: *}} context
 * @returns {string}
 * @throws {XPathError} XPDY0002 when the context item is absent,
 *   FOTY0014 for function items
 */
export function contextString(context) {
  if (context.contextItem === undefined || context.contextItem === null) {
    throw new XPathError("XPDY0002", "The context item is absent");
  }
  return stringValue(context.contextItem);
}
