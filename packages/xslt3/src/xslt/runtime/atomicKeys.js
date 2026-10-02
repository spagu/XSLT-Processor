/**
 * Hash keys of atomic values for keys and grouping: two values get the
 * same key when they are equal under `eq` (untyped values compared as
 * strings, numbers compared as doubles after promotion, strings under a
 * collation).
 *
 * @module @tradik/xslt3/xslt/runtime/atomicKeys
 */

import { toDouble } from "../../functions/support.js";
import { mapKey } from "../../items/mapKey.js";
import { cast } from "../../xdm/cast.js";
import { types } from "../../xdm/types.js";

const NUMERIC = new Set(["decimal", "float", "double"]);

/**
 * The key of an atomic value.
 * @param {import("../../xdm/atomic.js").AtomicValue} value
 * @param {{key: ((s: string) => string)|null}|null} [collation]
 * @returns {string}
 */
export function comparisonKey(value, collation = null) {
  const atomic =
    value.type === types.untypedAtomic ? cast(value, types.string) : value;
  const primitive = atomic.type.primitive.localName;
  if (NUMERIC.has(primitive)) return `n${toDouble(atomic)}`;
  const key = mapKey(atomic);
  if (collation?.key && key.startsWith("s")) {
    return `s${collation.key(atomic.value)}`;
  }
  return key;
}

/** The key of NaN values. */
export const NAN_KEY = "nNaN";
