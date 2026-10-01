/**
 * Map keys: the string under which a map stores an atomic key, equal for
 * two keys exactly when they are the same key under op:same-key (F&O 3.1
 * section 17.1.1):
 *
 * - strings, xs:anyURI and xs:untypedAtomic compare as codepoint strings;
 * - numbers compare by exact mathematical value, whatever their type
 *   (the double 0.1 is not the decimal 0.1), NaN is the same key as NaN;
 * - dates and times are equal when they are the same instant, but a value
 *   with a timezone is never the same key as one without;
 * - durations compare by months and seconds, whatever their subtype;
 * - other values are only the same key as values of the same primitive.
 *
 * @module @tradik/xslt3/items/mapKey
 */

import { Decimal } from "../xdm/decimal.js";
import { formatHexBinary } from "../xdm/binary.js";
import { localSeconds, timelineSeconds } from "../xdm/timeline.js";

const stringLike = new Set(["string", "anyURI", "untypedAtomic"]);
const numeric = new Set(["decimal", "float", "double"]);

/**
 * Exact decimal value of a finite double.
 * @param {number} n
 * @returns {Decimal}
 */
export function exactDecimal(n) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n);
  const high = view.getUint32(0);
  const biased = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(view.getUint32(4));
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n);
  const exponent = (biased === 0 ? 1 : biased) - 1075;
  const signed = n < 0 ? -mantissa : mantissa;
  if (exponent >= 0) return Decimal.of(signed << BigInt(exponent));
  return Decimal.of(signed * 5n ** BigInt(-exponent), -exponent);
}

/**
 * Key string of a numeric value.
 * @param {bigint|Decimal|number} value
 * @returns {string}
 */
function numericKey(value) {
  if (typeof value === "bigint") return `n${value}`;
  if (typeof value === "object") return `n${value}`;
  if (Number.isNaN(value)) return "nNaN";
  if (!Number.isFinite(value)) return value > 0 ? "nINF" : "n-INF";
  return `n${exactDecimal(value)}`;
}

/**
 * Key string of an atomic map key.
 * @param {import("../xdm/atomic.js").AtomicValue} key
 * @returns {string}
 */
export function mapKey(key) {
  const primitive = key.type.primitive.localName;
  const { value } = key;
  if (stringLike.has(primitive)) return `s${value}`;
  if (numeric.has(primitive)) return numericKey(value);
  switch (primitive) {
    case "boolean":
      return `b${value}`;
    case "duration":
      return `d${value.months}:${value.seconds}`;
    case "hexBinary":
    case "base64Binary":
      return `${primitive}${formatHexBinary(value)}`;
    case "QName":
    case "NOTATION":
      return `${primitive}{${value.namespaceURI}}${value.localName}`;
    default: {
      const zoned = value.timezone !== null;
      const seconds = zoned ? timelineSeconds(value, 0) : localSeconds(value);
      return `${primitive}${zoned ? "Z" : "L"}${seconds}`;
    }
  }
}
