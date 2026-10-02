/**
 * fn:deep-equal for maps and arrays (F&O 3.1 section 14.2.1), the
 * `deepEqualItem` hook that deepEqual.js calls for items that are neither
 * atomic values nor nodes: maps are equal when they have the same keys
 * (op:same-key) with deep-equal values, arrays when their members are
 * deep-equal one by one. Other function items raise FOTY0015.
 *
 * @module @tradik/xslt3/functions/mapArrayEqual
 */

import { XPathError } from "../errors.js";
import { itemKind } from "../xdm/atomic.js";
import { deepEqualSequences } from "./deepEqual.js";

/**
 * Whether two items that are not both atomic values or nodes are
 * deep-equal.
 * @param {*} a
 * @param {*} b
 * @param {import("./deepEqual.js").DeepEqualOptions} options - Options of
 *   deepEqualSequences, with this function as `deepEqualItem`
 * @returns {boolean}
 * @throws {XPathError} FOTY0015 for function items other than maps and
 *   arrays
 */
export function deepEqualItem(a, b, options) {
  const kind = itemKind(a);
  if (kind === "function" || itemKind(b) === "function") {
    throw new XPathError("FOTY0015", "deep-equal cannot compare functions");
  }
  if (kind !== itemKind(b) || a.size !== b.size) return false;
  if (kind === "array") {
    return a.members.every((member, i) =>
      deepEqualSequences(member, b.members[i], options),
    );
  }
  return [...a.entries.values()].every(({ key, value }) => {
    const other = b.get(key);
    return other !== undefined && deepEqualSequences(value, other, options);
  });
}
