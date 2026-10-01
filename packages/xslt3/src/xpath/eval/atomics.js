/**
 * Shorthands for building atomic values of the common types and for
 * reading single values out of sequences.
 *
 * @module @tradik/xslt3/xpath/eval/atomics
 */

import { XPathError } from "../../errors.js";
import { AtomicValue } from "../../xdm/atomic.js";
import { atomize } from "../../xdm/nodes.js";
import { types } from "../../xdm/types.js";

const TRUE = new AtomicValue(types.boolean, true);
const FALSE = new AtomicValue(types.boolean, false);

/** @param {boolean} value @returns {AtomicValue} an xs:boolean */
export const booleanItem = (value) => (value ? TRUE : FALSE);

/** @param {bigint|number} value @returns {AtomicValue} an xs:integer */
export const integerItem = (value) =>
  new AtomicValue(types.integer, BigInt(value));

/** @param {string} value @returns {AtomicValue} an xs:string */
export const stringItem = (value) => new AtomicValue(types.string, value);

/** @param {number} value @returns {AtomicValue} an xs:double */
export const doubleItem = (value) => new AtomicValue(types.double, value);

/**
 * Atomizes a sequence that must hold at most one item.
 * @param {Array} sequence
 * @param {string} what - Operand description for the error message
 * @returns {AtomicValue|undefined} the atomic value, undefined when empty
 * @throws {XPathError} XPTY0004 for more than one item
 */
export function atomizeOptional(sequence, what) {
  const values = atomize(sequence);
  if (values.length > 1) {
    throw new XPathError(
      "XPTY0004",
      `The ${what} must not be a sequence of more than one item`,
    );
  }
  return values[0];
}
