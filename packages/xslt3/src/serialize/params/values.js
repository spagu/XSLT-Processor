/**
 * Conversion of serialization parameter values given in the JavaScript
 * API (booleans, numbers, strings, arrays, Maps, objects) or as the
 * lexical `value` attributes of an `output:serialization-parameters`
 * element into their normalized form. A value outside the domain of its
 * parameter is a SEPM0016 error (the element form turns it into SEPM0017).
 *
 * @module @tradik/xslt3/serialize/params/values
 */

import { XPathError } from "../../errors.js";
import { METHODS } from "./names.js";

/**
 * @param {string} name - Parameter name
 * @param {*} value - Rejected value
 * @returns {XPathError} SEPM0016
 */
export const invalidValue = (name, value) =>
  new XPathError(
    "SEPM0016",
    `Invalid value ${JSON.stringify(String(value))} of serialization parameter ${name}`,
  );

const TRUE_WORDS = new Set(["yes", "true", "1"]);
const FALSE_WORDS = new Set(["no", "false", "0"]);

/**
 * @param {string} name
 * @param {boolean|string} value - A boolean or yes/no, true/false, 1/0
 * @returns {boolean}
 */
export function toBoolean(name, value) {
  if (typeof value === "boolean") return value;
  const word = String(value).trim();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  throw invalidValue(name, value);
}

/**
 * @param {string} name
 * @param {boolean|string|null} value - A boolean, yes/no/omit or null (omit)
 * @returns {"yes"|"no"|"omit"}
 */
export function toStandalone(name, value) {
  if (value === null || String(value).trim() === "omit") return "omit";
  return toBoolean(name, value) ? "yes" : "no";
}

/**
 * Expanded name of an element name in Clark notation, the form names are
 * compared in.
 * @param {string} namespaceURI - "" for no namespace
 * @param {string} localName
 * @returns {string} "{uri}local"
 */
export const clarkName = (namespaceURI, localName) =>
  `{${namespaceURI}}${localName}`;

const EQNAME = /^(?:Q?\{([^{}]*)\})?([^\s{}:]+)$/;

/**
 * One element name: a QName object (`{namespaceURI, localName}`), an
 * EQName `Q{uri}local`, Clark notation `{uri}local`, a local name, or a
 * prefixed name when a resolver is given.
 * @param {string} name - Parameter name, for errors
 * @param {*} value
 * @param {(prefix: string) => string|undefined} [resolve] - Prefix lookup
 * @returns {string} the name in Clark notation
 */
export function toClarkName(name, value, resolve) {
  if (typeof value === "object" && value !== null) {
    return clarkName(value.namespaceURI ?? "", value.localName);
  }
  const text = String(value);
  const colon = text.indexOf(":");
  if (resolve && colon > 0 && !text.startsWith("Q{")) {
    const uri = resolve(text.slice(0, colon));
    if (uri === undefined) throw invalidValue(name, value);
    return clarkName(uri, text.slice(colon + 1));
  }
  const match = EQNAME.exec(text);
  if (!match) throw invalidValue(name, value);
  return clarkName(match[1] ?? "", match[2]);
}

/**
 * A list of element names: an array or Set of names, or one string of
 * whitespace-separated names.
 * @param {string} name
 * @param {*} value
 * @param {(prefix: string) => string|undefined} [resolve]
 * @returns {Set<string>} names in Clark notation
 */
export function toNameSet(name, value, resolve) {
  const list =
    typeof value === "string"
      ? value.split(/\s+/).filter(Boolean)
      : [...(value[Symbol.iterator] ? value : [value])];
  return new Set(list.map((item) => toClarkName(name, item, resolve)));
}

/**
 * The output method: one of {@link METHODS}. Extension methods (QNames
 * in a namespace) are not supported.
 * @param {string} name
 * @param {*} value - A string or a QName object
 * @returns {string}
 */
export function toMethod(name, value) {
  if (typeof value === "object" && value !== null) {
    if (value.namespaceURI) {
      throw invalidValue(name, `Q{${value.namespaceURI}}${value.localName}`);
    }
    return toMethod(name, value.localName);
  }
  const text = String(value).trim();
  if (METHODS.includes(text)) return text;
  throw invalidValue(name, value);
}

/**
 * @param {string} name
 * @param {number|string|{toNumber: () => number}} value - A decimal
 * @returns {number}
 */
export function toDecimal(name, value) {
  if (typeof value === "number") return value;
  if (typeof value?.toNumber === "function") return value.toNumber();
  const text = String(value).trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) throw invalidValue(name, value);
  return Number(text);
}

/**
 * A character map: a Map or a plain object from single characters to
 * replacement strings.
 * @param {string} name
 * @param {Map<string, string>|Record<string, string>} value
 * @returns {Map<string, string>}
 */
export function toCharacterMap(name, value) {
  const entries =
    value instanceof Map ? [...value.entries()] : Object.entries(value);
  const map = new Map();
  for (const [character, replacement] of entries) {
    if ([...character].length !== 1) throw invalidValue(name, character);
    map.set(character, String(replacement));
  }
  return map;
}

/** Converters by parameter kind (see PARAMETER_KINDS). */
export const CONVERTERS = Object.freeze({
  boolean: toBoolean,
  string: (_, value) => String(value),
  qnames: toNameSet,
  method: toMethod,
  decimal: toDecimal,
  standalone: toStandalone,
  characterMap: toCharacterMap,
});
