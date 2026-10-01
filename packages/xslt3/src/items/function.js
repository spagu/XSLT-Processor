/**
 * Function items of XDM 3.1 other than maps and arrays: named function
 * references, inline functions, partial applications and coerced functions.
 *
 * A function item is self-contained: `invoke(args)` applies the function
 * conversion rules to its arguments and checks its result, using the
 * static and dynamic context captured when the item was created.
 *
 * @module @tradik/xslt3/items/function
 */

import { ITEM_KIND } from "../xdm/atomic.js";

/**
 * Signature of a function item.
 * @typedef {object} Signature
 * @property {object[]} params - Compiled sequence types of the parameters
 *   (see xpath/eval/sequenceType.js)
 * @property {object} returns - Compiled sequence type of the result
 */

/** A function item. */
export class FunctionItem {
  /**
   * @param {object} init
   * @param {import("../xdm/qname.js").QNameValue|null} [init.name] - Name,
   *   null for anonymous functions
   * @param {number} init.arity - Number of parameters
   * @param {Signature} init.signature - Parameter and result types
   * @param {(args: Array<Array>) => Array} init.invoke - Implementation,
   *   called with one sequence per parameter
   */
  constructor({ name = null, arity, signature, invoke }) {
    this.name = name;
    this.arity = arity;
    this.signature = signature;
    this.invoke = invoke;
    Object.freeze(this);
  }

  /** @returns {"function"} the item kind */
  get [ITEM_KIND]() {
    return "function";
  }
}
