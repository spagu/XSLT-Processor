/**
 * Arrays of XDM 3.1: immutable lists of members, each member a sequence.
 * An array is also a function of arity 1 from a position (xs:integer,
 * starting at 1) to the member there.
 *
 * @module @tradik/xslt3/items/array
 */

import { XPathError } from "../errors.js";
import { ITEM_KIND } from "../xdm/atomic.js";
import { cast } from "../xdm/cast.js";
import { atomize } from "../xdm/nodes.js";
import { derivesFrom, types } from "../xdm/types.js";

/** An immutable XDM array. */
export class XdmArray {
  /**
   * @param {Array<Array>} [members] - Members (sequences); owned by the array
   */
  constructor(members = []) {
    this.members = members;
    Object.freeze(this);
  }

  /** @returns {"array"} the item kind */
  get [ITEM_KIND]() {
    return "array";
  }

  /** @returns {number} 1: an array is a function of one position */
  get arity() {
    return 1;
  }

  /** @returns {null} arrays are anonymous functions */
  get name() {
    return null;
  }

  /** @returns {number} number of members */
  get size() {
    return this.members.length;
  }

  /**
   * Member at a position.
   * @param {bigint|number} position - 1-based
   * @returns {Array} the member
   * @throws {XPathError} FOAY0001 when the position is out of bounds
   */
  get(position) {
    const index = Number(position) - 1;
    if (!(index >= 0 && index < this.members.length)) {
      throw new XPathError(
        "FOAY0001",
        `Array index ${position} is out of bounds (size ${this.members.length})`,
      );
    }
    return this.members[index];
  }

  /**
   * Calls the array as a function: `$array($position)`.
   * @param {Array<Array>} args - One argument: a single xs:integer
   *   (xs:untypedAtomic is cast)
   * @returns {Array} the member
   * @throws {XPathError} XPTY0004 for another argument, FOAY0001 when out
   *   of bounds
   */
  invoke(args) {
    const values = atomize(args[0]);
    let position = values[0];
    if (values.length === 1 && position.type === types.untypedAtomic) {
      position = cast(position, types.integer);
    }
    if (values.length !== 1 || !derivesFrom(position.type, types.integer)) {
      throw new XPathError(
        "XPTY0004",
        "An array lookup needs exactly one xs:integer",
      );
    }
    return this.get(position.value);
  }
}
