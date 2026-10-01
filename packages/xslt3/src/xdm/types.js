/**
 * Registry of the built-in atomic types of XDM 3.1 for a basic
 * (non-schema-aware) processor, with the XSD 1.1 derivation hierarchy.
 *
 * A type descriptor has:
 * - `name`: expanded QName in Clark notation, `{http://www.w3.org/2001/XMLSchema}integer`
 * - `localName`, `prefixedName` ("xs:integer")
 * - `base`: the descriptor it is derived from (null for xs:anyAtomicType and xs:error)
 * - `primitive`: the XSD primitive ancestor-or-self (xs:integer → xs:decimal);
 *   xs:untypedAtomic is its own primitive
 * - `castPrimitive`: the "primitive type" of F&O 3.1 section 19, which also
 *   counts xs:integer, xs:yearMonthDuration and xs:dayTimeDuration
 * - `whiteSpace`: "preserve", "replace" or "collapse"
 * - `abstract`: true for types with no direct instances
 * - `facets`: `{ minInclusive?, maxInclusive? }` (BigInt) for integer types,
 *   `{ pattern?: RegExp }` for string types, `{ timezoneRequired? }`
 *
 * @module @tradik/xslt3/xdm/types
 */

import { XPathError } from "../errors.js";

/** The XML Schema namespace URI. */
export const XS_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

const nameStart =
  "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF" +
  "\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF" +
  "\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const nameChar = `${nameStart}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;

/** Patterns of the XML name productions (XML 1.0 fifth edition). */
/* eslint-disable no-misleading-character-class -- NameChar includes the
   combining marks U+0300 to U+036F on their own, as the XML grammar says */
export const namePatterns = Object.freeze({
  ncName: new RegExp(`^[${nameStart}][${nameChar}]*$`, "u"),
  name: new RegExp(`^[:${nameStart}][:${nameChar}]*$`, "u"),
  nmToken: new RegExp(`^[:${nameChar}]+$`, "u"),
});
/* eslint-enable no-misleading-character-class */

/** @type {Map<string, object>} descriptors by local name */
const byLocalName = new Map();

/**
 * Registers a built-in type.
 * @param {string} localName
 * @param {string|null} baseName
 * @param {object} [options] - whiteSpace, abstract, facets, castPrimitive
 */
function define(localName, baseName, options = {}) {
  const base = baseName === null ? null : byLocalName.get(baseName);
  const type = {
    name: `{${XS_NAMESPACE}}${localName}`,
    localName,
    prefixedName: `xs:${localName}`,
    base,
    whiteSpace: options.whiteSpace ?? base?.whiteSpace ?? "collapse",
    abstract: options.abstract ?? false,
    facets: Object.freeze({ ...options.facets }),
  };
  const primitiveRoot = base === null || base.localName === "anyAtomicType";
  type.primitive = primitiveRoot ? type : base.primitive;
  type.castPrimitive =
    options.castPrimitive || primitiveRoot ? type : base.castPrimitive;
  byLocalName.set(localName, Object.freeze(type));
}

const range = (min, max) => ({
  facets: { minInclusive: min ?? undefined, maxInclusive: max ?? undefined },
});

define("anyAtomicType", null, { abstract: true });
define("error", null);
define("untypedAtomic", "anyAtomicType", { whiteSpace: "preserve" });
define("string", "anyAtomicType", { whiteSpace: "preserve" });
define("normalizedString", "string", { whiteSpace: "replace" });
define("token", "normalizedString", { whiteSpace: "collapse" });
define("language", "token", {
  facets: { pattern: /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/ },
});
define("NMTOKEN", "token", { facets: { pattern: namePatterns.nmToken } });
define("Name", "token", { facets: { pattern: namePatterns.name } });
define("NCName", "Name", { facets: { pattern: namePatterns.ncName } });
for (const name of ["ID", "IDREF", "ENTITY"]) define(name, "NCName");
define("boolean", "anyAtomicType");
define("decimal", "anyAtomicType");
define("integer", "decimal", { castPrimitive: true });
define("nonPositiveInteger", "integer", range(null, 0n));
define("negativeInteger", "nonPositiveInteger", range(null, -1n));
define("long", "integer", range(-(2n ** 63n), 2n ** 63n - 1n));
define("int", "long", range(-(2n ** 31n), 2n ** 31n - 1n));
define("short", "int", range(-32768n, 32767n));
define("byte", "short", range(-128n, 127n));
define("nonNegativeInteger", "integer", range(0n, null));
define("unsignedLong", "nonNegativeInteger", range(0n, 2n ** 64n - 1n));
define("unsignedInt", "unsignedLong", range(0n, 2n ** 32n - 1n));
define("unsignedShort", "unsignedInt", range(0n, 65535n));
define("unsignedByte", "unsignedShort", range(0n, 255n));
define("positiveInteger", "nonNegativeInteger", range(1n, null));
define("float", "anyAtomicType");
define("double", "anyAtomicType");
define("duration", "anyAtomicType");
define("yearMonthDuration", "duration", { castPrimitive: true });
define("dayTimeDuration", "duration", { castPrimitive: true });
define("dateTime", "anyAtomicType");
define("dateTimeStamp", "dateTime", { facets: { timezoneRequired: true } });
for (const name of [
  "date",
  "time",
  "gYearMonth",
  "gYear",
  "gMonthDay",
  "gDay",
  "gMonth",
]) {
  define(name, "anyAtomicType");
}
define("hexBinary", "anyAtomicType");
define("base64Binary", "anyAtomicType");
define("anyURI", "anyAtomicType");
define("QName", "anyAtomicType");
define("NOTATION", "anyAtomicType", { abstract: true });

const clarkPattern = new RegExp(
  `^\\{${XS_NAMESPACE.replaceAll(".", "\\.")}\\}(.+)$`,
);

/**
 * Looks up a built-in atomic type.
 * @param {string|object} name - A descriptor, "xs:integer", "integer" or
 *   "{http://www.w3.org/2001/XMLSchema}integer"
 * @returns {object} the type descriptor
 * @throws {XPathError} XPST0051 for an unknown type name
 */
export function getType(name) {
  if (typeof name === "object" && name !== null) return name;
  const localName = String(name)
    .replace(/^xs:/, "")
    .replace(clarkPattern, "$1");
  const type = byLocalName.get(localName);
  if (!type) throw new XPathError("XPST0051", `Unknown atomic type ${name}`);
  return type;
}

/**
 * Whether a type is the same as or derived (by restriction) from another.
 * Every atomic type derives from xs:anyAtomicType; xs:error from nothing.
 * @param {object|string} type
 * @param {object|string} ancestor
 * @returns {boolean}
 */
export function derivesFrom(type, ancestor) {
  const target = getType(ancestor);
  for (let t = getType(type); t !== null; t = t.base) {
    if (t === target) return true;
  }
  return false;
}

/** @returns {object[]} all registered type descriptors */
export function allTypes() {
  return [...byLocalName.values()];
}

/** @type {Readonly<Record<string, object>>} descriptors by local name */
export const types = Object.freeze(Object.fromEntries(byLocalName));

const numericNames = new Set(["decimal", "float", "double"]);

/**
 * Whether a type is numeric (xs:decimal, xs:float, xs:double or derived).
 * @param {object} type
 * @returns {boolean}
 */
export function isNumericType(type) {
  return numericNames.has(type.primitive.localName);
}
