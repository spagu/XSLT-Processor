/**
 * Casting between atomic types (F&O 3.1 section 19): the primitive-to-
 * primitive table of 19.1, casting from strings (19.2) and casting to and
 * from derived types (19.3).
 *
 * @module @tradik/xslt3/xdm/cast
 */

import { XPathError } from "../errors.js";
import { AtomicValue, checkFacets } from "./atomic.js";
import { componentsOf, DateTimeValue } from "./datetime.js";
import { Decimal } from "./decimal.js";
import { DurationValue } from "./duration.js";
import { canonicalString, fromLexical } from "./lexical.js";
import { numberToDecimal } from "./numeric.js";
import { getType } from "./types.js";

const durationKinds = ["duration", "yearMonthDuration", "dayTimeDuration"];

/**
 * @param {number} n
 * @returns {number} n
 * @throws {XPathError} FOCA0002 for NaN and the infinities
 */
function finite(n) {
  if (!Number.isFinite(n)) {
    throw new XPathError("FOCA0002", `Cannot cast ${n} to a decimal`);
  }
  return n;
}

/** @param {*} v @param {string} from @returns {number} numeric value as a double */
function toDouble(v, from) {
  if (from === "boolean") return v ? 1 : 0;
  return from === "decimal" ? v.toNumber() : Number(v);
}

/**
 * Projects a date/time value onto the components of another kind; missing
 * time components become midnight (xs:date to xs:dateTime).
 * @param {DateTimeValue} v
 * @param {string} kind - Target primitive
 * @returns {DateTimeValue}
 */
function project(v, kind) {
  const fields = { timezone: v.timezone };
  for (const name of componentsOf(kind)) {
    fields[name] = v[name] ?? (name === "second" ? Decimal.ZERO : 0);
  }
  return new DateTimeValue(fields);
}

/**
 * Conversions of the F&O 3.1 19.1 table, by target then source primitive
 * (the "Y" and "M" cells; strings are handled by lexical parsing).
 */
const table = {
  float: { double: Math.fround },
  double: { float: (v) => v },
  decimal: {
    float: (v) => numberToDecimal(finite(v), true),
    double: (v) => numberToDecimal(finite(v)),
    integer: (v) => Decimal.of(v),
    boolean: (v) => (v ? Decimal.of(1n) : Decimal.ZERO),
  },
  integer: {
    float: (v) => BigInt(Math.trunc(finite(v))),
    double: (v) => BigInt(Math.trunc(finite(v))),
    decimal: (v) => v.trunc(),
    boolean: (v) => (v ? 1n : 0n),
  },
  boolean: {
    float: (v) => !(v === 0 || Number.isNaN(v)),
    double: (v) => !(v === 0 || Number.isNaN(v)),
    decimal: (v) => v.sign() !== 0,
    integer: (v) => v !== 0n,
  },
  duration: {},
  yearMonthDuration: {},
  dayTimeDuration: {},
  hexBinary: { base64Binary: (v) => v },
  base64Binary: { hexBinary: (v) => v },
  dateTime: { date: (v) => project(v, "dateTime") },
  time: { dateTime: (v) => project(v, "time") },
  date: { dateTime: (v) => project(v, "date") },
};
for (const from of ["integer", "decimal", "boolean"]) {
  table.float[from] = (v) => Math.fround(toDouble(v, from));
  table.double[from] = (v) => toDouble(v, from);
}
for (const to of durationKinds) {
  for (const from of durationKinds) {
    table[to][from] = (v) =>
      new DurationValue(
        to === "dayTimeDuration" ? 0 : v.months,
        to === "yearMonthDuration" ? Decimal.ZERO : v.seconds,
      );
  }
}
for (const to of ["gYearMonth", "gYear", "gMonthDay", "gDay", "gMonth"]) {
  table[to] = { dateTime: (v) => project(v, to), date: (v) => project(v, to) };
}

/**
 * Converts a value between two primitive types of the casting table.
 * @param {AtomicValue} item
 * @param {object} target - Primitive type descriptor (F&O sense)
 * @returns {*} the converted value representation
 * @throws {XPathError} XPTY0004 when the table has no conversion
 */
function convertPrimitive(item, target) {
  const from = item.type.castPrimitive.localName;
  if (from === target.localName) return item.value;
  if (target.localName === "string" || target.localName === "untypedAtomic") {
    return canonicalString(item);
  }
  const convert = table[target.localName]?.[from];
  if (!convert) {
    throw new XPathError(
      "XPTY0004",
      `Cannot cast ${item.type.prefixedName} to ${target.prefixedName}`,
    );
  }
  return convert(item.value);
}

/**
 * Casts an atomic value to an atomic type (`$value cast as T`).
 * @param {AtomicValue} item
 * @param {string|object} typeName - Target type name or descriptor
 * @param {object} [options]
 * @param {import("./qname.js").NamespaceResolver} [options.resolveNamespace]
 *   - Prefix resolver for casting strings to xs:QName
 * @returns {AtomicValue}
 * @throws {XPathError} XPST0080 (abstract target), XPTY0004 (cast not
 *   allowed), FORG0001 (invalid value; always for xs:error), FOCA0002 (NaN/INF to decimal or
 *   integer), FODT0001/FODT0002 (date/duration overflow), FONS0004
 */
export function cast(item, typeName, options = {}) {
  const target = getType(typeName);
  if (target.abstract) {
    throw new XPathError("XPST0080", `Cannot cast to ${target.prefixedName}`);
  }
  if (target.localName === "error") {
    throw new XPathError("FORG0001", "No value can be cast to xs:error");
  }
  if (item.type === target) return item;
  const sourcePrimitive = item.type.primitive.localName;
  if (sourcePrimitive === "string" || sourcePrimitive === "untypedAtomic") {
    return fromLexical(target, item.value, options);
  }
  const value = convertPrimitive(item, target.castPrimitive);
  if (target.castPrimitive.localName === "string") {
    return fromLexical(target, value);
  }
  return new AtomicValue(target, checkFacets(target, value));
}

/**
 * Whether a cast would succeed (`$value castable as T`). Static errors
 * (unknown or abstract target type) and non-XPath errors are still raised.
 * @param {AtomicValue} item
 * @param {string|object} typeName
 * @param {object} [options] - As for {@link cast}
 * @returns {boolean}
 */
export function castable(item, typeName, options = {}) {
  try {
    cast(item, typeName, options);
    return true;
  } catch (error) {
    const isStatic = error.code === "XPST0080" || error.code === "XPST0051";
    if (!(error instanceof XPathError) || isStatic) throw error;
    return false;
  }
}
