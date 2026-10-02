/**
 * Lexical spaces of all built-in atomic types: parsing a string into a
 * typed value (F&O 3.1 19.2, casting from xs:string) and the canonical
 * string of a value (F&O 3.1 19.1.1, casting to xs:string).
 *
 * @module @tradik/xslt3/xdm/lexical
 */

import { XPathError } from "../errors.js";
import { AtomicValue, checkFacets } from "./atomic.js";
import {
  formatBase64Binary,
  formatHexBinary,
  parseBase64Binary,
  parseHexBinary,
} from "./binary.js";
import { formatDateTime, parseDateTime } from "./datetime.js";
import { formatDuration, parseDuration } from "./duration.js";
import {
  formatDouble,
  parseDecimal,
  parseDouble,
  parseFloat32,
  parseInteger,
} from "./numeric.js";
import { parseQName } from "./qname.js";
import { normalizeWhitespace, parseBoolean } from "./strings.js";
import { getType } from "./types.js";

const identity = (text) => text;
const durationKinds = ["duration", "yearMonthDuration", "dayTimeDuration"];
const dateTimeKinds = [
  "dateTime",
  "date",
  "time",
  "gYearMonth",
  "gYear",
  "gMonthDay",
  "gDay",
  "gMonth",
];

/** Parsers by cast-primitive local name: (text, kind, options) → value | null. */
const parsers = {
  untypedAtomic: identity,
  string: identity,
  anyURI: identity,
  boolean: parseBoolean,
  decimal: parseDecimal,
  integer: parseInteger,
  double: parseDouble,
  float: parseFloat32,
  hexBinary: parseHexBinary,
  base64Binary: parseBase64Binary,
  QName: (text, _kind, options) => parseQName(text, options.resolveNamespace),
};
for (const kind of durationKinds) {
  parsers[kind] = (text) => parseDuration(kind, text);
}
for (const kind of dateTimeKinds) {
  parsers[kind] = (text) => parseDateTime(kind, text);
}

/** Formatters by cast-primitive local name: value → canonical string. */
const formatters = {
  untypedAtomic: identity,
  string: identity,
  anyURI: identity,
  boolean: String,
  decimal: String,
  integer: String,
  double: (value) => formatDouble(value),
  float: (value) => formatDouble(value, true),
  hexBinary: formatHexBinary,
  base64Binary: formatBase64Binary,
  QName: String,
  NOTATION: String,
};
for (const kind of durationKinds) {
  formatters[kind] = (value) => formatDuration(kind, value);
}
for (const kind of dateTimeKinds) {
  formatters[kind] = (value) => formatDateTime(kind, value);
}

/**
 * Converts a string to a value of an atomic type by the rules of XSD
 * validation: whiteSpace facet, lexical space, then the other facets.
 * @param {string|object} typeName - Target type
 * @param {string} text
 * @param {object} [options]
 * @param {import("./qname.js").NamespaceResolver} [options.resolveNamespace]
 *   - Prefix resolver for xs:QName
 * @returns {AtomicValue}
 * @throws {XPathError} XPST0080 for abstract types, FORG0001 for invalid
 *   text, FODT0001/FODT0002 for out-of-range dates/durations, FONS0004 for
 *   unbound QName prefixes
 */
export function fromLexical(typeName, text, options = {}) {
  const type = getType(typeName);
  if (type.abstract) {
    throw new XPathError("XPST0080", `Cannot cast to ${type.prefixedName}`);
  }
  const parse = parsers[type.castPrimitive.localName];
  const normalized = normalizeWhitespace(text, type.whiteSpace);
  const value = parse
    ? parse(normalized, type.castPrimitive.localName, options)
    : null;
  if (value === null) {
    throw new XPathError(
      "FORG0001",
      `"${text}" is not a valid ${type.prefixedName}`,
    );
  }
  return new AtomicValue(type, checkFacets(type, value));
}

/**
 * Canonical string of an atomic value (the result of casting it to
 * xs:string).
 * @param {AtomicValue} item
 * @returns {string}
 */
export function canonicalString(item) {
  return formatters[item.type.castPrimitive.localName](item.value);
}
