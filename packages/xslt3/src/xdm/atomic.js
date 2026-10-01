/**
 * Items of the data model: atomic values, nodes and the function items
 * (maps, arrays, functions) that the evaluator adds later.
 *
 * Atomic value representations by primitive type:
 * - xs:string family, xs:untypedAtomic, xs:anyURI: JS string
 * - xs:boolean: JS boolean
 * - xs:decimal: {@link Decimal}; xs:integer and subtypes: BigInt
 * - xs:double, xs:float: JS number (float values pass through Math.fround)
 * - durations: {@link DurationValue}; dates and times: {@link DateTimeValue}
 * - xs:hexBinary, xs:base64Binary: Uint8Array
 * - xs:QName, xs:NOTATION: {@link QNameValue}
 *
 * A sequence is a plain JS array of items.
 *
 * @module @tradik/xslt3/xdm/atomic
 */

import { XPathError } from "../errors.js";
import { Decimal } from "./decimal.js";
import { normalizeWhitespace } from "./strings.js";
import { getType } from "./types.js";

/**
 * Property under which maps, arrays and function items declare their kind
 * ("map", "array" or "function"). Arrays also expose `members`, an array
 * of sequences, which atomization flattens.
 */
export const ITEM_KIND = Symbol.for("@tradik/xslt3/itemKind");

/** An immutable atomic value: a type descriptor and a typed value. */
export class AtomicValue {
  /**
   * Prefer {@link atomic}, which coerces and validates the value.
   * @param {object} type - Type descriptor from the registry
   * @param {*} value - Representation for the type's primitive
   */
  constructor(type, value) {
    this.type = type;
    this.value = value;
    Object.freeze(this);
  }
}

/**
 * @param {*} item
 * @returns {"atomic"|"node"|"map"|"array"|"function"} the kind of an item
 * @throws {XPathError} XPTY0004 for a value that is not an item
 */
export function itemKind(item) {
  if (item instanceof AtomicValue) return "atomic";
  // Nodes before the symbol: on a DOM node (a jsdom wrapper) the symbol is
  // looked up along a long prototype chain
  if (typeof item?.nodeType === "number") return "node";
  if (item?.[ITEM_KIND]) return item[ITEM_KIND];
  throw new XPathError("XPTY0004", `Not an XDM item: ${String(item)}`);
}

/** @param {*} item @returns {boolean} whether the item is an atomic value */
export const isAtomic = (item) => item instanceof AtomicValue;
/** @param {*} item @returns {boolean} whether the item is a DOM node */
export const isNode = (item) =>
  !isAtomic(item) && typeof item?.nodeType === "number";
/** @param {*} item @returns {boolean} whether the item is a map */
export const isMap = (item) => item?.[ITEM_KIND] === "map";
/** @param {*} item @returns {boolean} whether the item is an array */
export const isArray = (item) => item?.[ITEM_KIND] === "array";
/** @param {*} item @returns {boolean} whether the item is a function item (maps and arrays are functions too) */
export const isFunctionItem = (item) => Boolean(item?.[ITEM_KIND]);

/**
 * Checks the constraining facets of a type that is derived by restriction
 * from a primitive (integer ranges, string patterns and whitespace,
 * required timezone).
 * @param {object} type
 * @param {*} value - Representation for the type's primitive
 * @returns {*} the value
 * @throws {XPathError} FORG0001 when a facet is violated
 */
export function checkFacets(type, value) {
  for (let t = type; t !== t.castPrimitive; t = t.base) {
    const { minInclusive, maxInclusive, pattern, timezoneRequired } = t.facets;
    const fails =
      (minInclusive !== undefined && value < minInclusive) ||
      (maxInclusive !== undefined && value > maxInclusive) ||
      (pattern !== undefined && !pattern.test(value)) ||
      (typeof value === "string" &&
        normalizeWhitespace(value, t.whiteSpace) !== value) ||
      (timezoneRequired === true && value.timezone === null);
    if (fails) {
      throw new XPathError(
        "FORG0001",
        `Value is not a valid ${type.prefixedName}`,
      );
    }
  }
  return value;
}

/** Coercions of JS values to the representation of a primitive. */
const coercions = {
  integer(value) {
    if (typeof value === "bigint") return value;
    if (Number.isInteger(value)) return BigInt(value);
    throw new XPathError("FORG0001", `${value} is not an integer`);
  },
  decimal(value) {
    if (value instanceof Decimal) return value;
    const decimal = Decimal.parse(
      typeof value === "bigint" ? `${value}` : String(value),
    );
    if (decimal === null) {
      throw new XPathError("FORG0001", `${value} is not a decimal`);
    }
    return decimal;
  },
  float: (value) => Math.fround(value),
};

/**
 * Builds an atomic value from a JS value in the type's representation
 * (numbers and BigInts are accepted for xs:integer and xs:decimal, and
 * floats are rounded); derived types have their facets checked.
 * @param {string|object} typeName - "xs:integer", "integer", Clark name or descriptor
 * @param {*} value
 * @returns {AtomicValue}
 * @throws {XPathError} XPST0080 for abstract types, FORG0001 for invalid
 *   values and for xs:error
 * @example atomic("xs:integer", 42); atomic("xs:string", "abc")
 */
export function atomic(typeName, value) {
  const type = getType(typeName);
  if (type.abstract) {
    throw new XPathError("XPST0080", `${type.prefixedName} is abstract`);
  }
  if (type.localName === "error") {
    throw new XPathError("FORG0001", "xs:error has no values");
  }
  const coerce = coercions[type.castPrimitive.localName];
  const coerced = coerce ? coerce(value) : value;
  return new AtomicValue(type, checkFacets(type, coerced));
}
