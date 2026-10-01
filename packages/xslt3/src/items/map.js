/**
 * Maps of XDM 3.1: immutable sets of entries from atomic keys (compared
 * with op:same-key, see mapKey.js) to sequences. A map is also a function
 * of arity 1 that returns the value of a key, or the empty sequence.
 *
 * Entries keep their insertion order, which XDM leaves
 * implementation-dependent.
 *
 * @module @tradik/xslt3/items/map
 */

import { XPathError } from "../errors.js";
import { ITEM_KIND } from "../xdm/atomic.js";
import { atomize } from "../xdm/nodes.js";
import { mapKey } from "./mapKey.js";

/** An immutable XDM map. */
export class XdmMap {
  /**
   * @param {Map<string, {key: import("../xdm/atomic.js").AtomicValue, value: Array}>} [entries]
   *   - Entries by key string; owned by the new map
   */
  constructor(entries = new Map()) {
    this.entries = entries;
    Object.freeze(this);
  }

  /** @returns {"map"} the item kind */
  get [ITEM_KIND]() {
    return "map";
  }

  /** @returns {number} 1: a map is a function of one key */
  get arity() {
    return 1;
  }

  /** @returns {null} maps are anonymous functions */
  get name() {
    return null;
  }

  /** @returns {number} number of entries */
  get size() {
    return this.entries.size;
  }

  /**
   * Builds a map from key/value pairs; a later duplicate key replaces the
   * earlier one unless `onDuplicate` throws.
   * @param {Iterable<[import("../xdm/atomic.js").AtomicValue, Array]>} pairs
   * @param {(key: import("../xdm/atomic.js").AtomicValue) => void} [onDuplicate]
   * @returns {XdmMap}
   */
  static from(pairs, onDuplicate) {
    const entries = new Map();
    for (const [key, value] of pairs) {
      const k = mapKey(key);
      if (onDuplicate && entries.has(k)) onDuplicate(key);
      entries.set(k, { key, value });
    }
    return new XdmMap(entries);
  }

  /**
   * @param {import("../xdm/atomic.js").AtomicValue} key
   * @returns {Array|undefined} the value of the key, undefined when absent
   */
  get(key) {
    return this.entries.get(mapKey(key))?.value;
  }

  /** @param {import("../xdm/atomic.js").AtomicValue} key @returns {boolean} */
  has(key) {
    return this.entries.has(mapKey(key));
  }

  /** @returns {import("../xdm/atomic.js").AtomicValue[]} the keys */
  keys() {
    return [...this.entries.values()].map((entry) => entry.key);
  }

  /**
   * @param {import("../xdm/atomic.js").AtomicValue} key
   * @param {Array} value
   * @returns {XdmMap} a copy with the entry added or replaced
   */
  put(key, value) {
    const entries = new Map(this.entries);
    entries.set(mapKey(key), { key, value });
    return new XdmMap(entries);
  }

  /**
   * @param {import("../xdm/atomic.js").AtomicValue[]} keys
   * @returns {XdmMap} a copy without the keys
   */
  remove(keys) {
    const entries = new Map(this.entries);
    for (const key of keys) entries.delete(mapKey(key));
    return new XdmMap(entries);
  }

  /**
   * Calls the map as a function: `$map($key)`.
   * @param {Array<Array>} args - One argument: a single atomic value
   * @returns {Array} the value, or the empty sequence
   * @throws {XPathError} XPTY0004 when the argument is not one atomic value
   */
  invoke(args) {
    const key = atomize(args[0]);
    if (key.length !== 1) {
      throw new XPathError(
        "XPTY0004",
        "A map lookup needs exactly one atomic key",
      );
    }
    return this.get(key[0]) ?? [];
  }
}
