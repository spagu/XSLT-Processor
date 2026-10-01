/**
 * Collations (F&O 3.1 section 5.3): the Unicode codepoint collation, the
 * HTML ASCII case-insensitive collation and the UCA collation family,
 * which falls back to `Intl.Collator` (allowed by `fallback=yes`, the
 * default).
 *
 * @module @tradik/xslt3/functions/collations
 */

import { XPathError } from "../errors.js";
import { compareCodepoints } from "../xdm/strings.js";

/** URI of the Unicode codepoint collation, the default collation. */
export const CODEPOINT_COLLATION =
  "http://www.w3.org/2005/xpath-functions/collation/codepoint";
/** URI of the HTML ASCII case-insensitive collation. */
export const HTML_ASCII_COLLATION =
  "http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive";
const UCA_PREFIX = "http://www.w3.org/2013/collation/UCA";

/**
 * A collation.
 * @typedef {object} Collation
 * @property {string} uri
 * @property {(a: string, b: string) => number} compare - -1, 0 or 1
 * @property {((s: string) => string)|null} key - Maps equal strings to the
 *   same key, with the same length (for hashing and substring matching);
 *   null when only `compare` is available
 * @property {boolean} [substrings] - false when substring matching is not
 *   supported
 */

/** @param {string} s @returns {string} A-Z mapped to a-z */
const asciiLower = (s) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());

const codepoint = Object.freeze({
  uri: CODEPOINT_COLLATION,
  compare: compareCodepoints,
  key: (s) => s,
});

const htmlAscii = Object.freeze({
  uri: HTML_ASCII_COLLATION,
  compare: (a, b) => compareCodepoints(asciiLower(a), asciiLower(b)),
  key: asciiLower,
});

const strengths = {
  primary: "base",
  1: "base",
  secondary: "accent",
  2: "accent",
  tertiary: "variant",
  3: "variant",
};

/** UCA parameters that Intl.Collator honours. */
const SUPPORTED = new Set([
  "fallback",
  "lang",
  "strength",
  "numeric",
  "caseFirst",
  "alternate",
]);

/**
 * Builds a collation from a UCA collation URI with `Intl.Collator`. Only
 * `lang`, `strength`, `numeric`, `caseFirst` and `alternate` (as
 * ignorePunctuation) are honoured; the others fall back to the defaults.
 * @param {string} uri
 * @returns {Collation}
 * @throws {XPathError} FOCH0002 when `fallback=no` asks for an unsupported
 *   parameter
 */
function ucaCollation(uri) {
  const params = new Map(
    uri
      .slice(UCA_PREFIX.length + 1)
      .split(";")
      .filter(Boolean)
      .map((pair) => pair.split("=")),
  );
  if (
    params.get("fallback") === "no" &&
    [...params.keys()].some((key) => !SUPPORTED.has(key))
  ) {
    throw new XPathError("FOCH0002", `Unsupported collation ${uri}`);
  }
  const caseFirst = params.get("caseFirst");
  const options = {
    sensitivity: strengths[params.get("strength")] ?? "variant",
    numeric: params.get("numeric") === "yes",
    caseFirst:
      caseFirst === "upper" || caseFirst === "lower" ? caseFirst : "false",
    ignorePunctuation: ["blanked", "shifted"].includes(params.get("alternate")),
  };
  let collator;
  try {
    collator = new Intl.Collator(params.get("lang") || "en", options);
  } catch {
    collator = new Intl.Collator("en", options);
  }
  return Object.freeze({
    uri,
    compare: (a, b) => Math.sign(collator.compare(a, b)),
    key: null,
    // numeric collation units have no substrings ("10" is one unit)
    substrings: !options.numeric,
  });
}

/**
 * Finds the first substring of `text` that is equal to `search` under a
 * collation (the shortest one at the leftmost position).
 * @param {Collation} collation
 * @param {string} text
 * @param {string} search
 * @param {"start"|"end"|null} [anchor] - Require a match at an end
 * @returns {[number, number]|null} [start, end) offsets, null when absent
 * @throws {XPathError} FOCH0004 for collations without substring matching
 */
export function findSubstring(collation, text, search, anchor = null) {
  if (collation.substrings === false) {
    throw new XPathError(
      "FOCH0004",
      `The collation ${collation.uri} does not support substring matching`,
    );
  }
  if (collation.key) {
    const a = collation.key(text);
    const b = collation.key(search);
    const index =
      anchor === "start"
        ? a.startsWith(b)
          ? 0
          : -1
        : anchor === "end"
          ? a.endsWith(b)
            ? a.length - b.length
            : -1
          : a.indexOf(b);
    return index < 0 ? null : [index, index + b.length];
  }
  const starts = anchor === "start" ? [0] : [...Array(text.length + 1).keys()];
  for (const start of starts) {
    const ends =
      anchor === "end" ? [text.length] : [...Array(text.length + 1).keys()];
    for (const end of ends.filter((e) => e >= start)) {
      if (collation.compare(text.slice(start, end), search) === 0) {
        return [start, end];
      }
    }
  }
  return null;
}

/**
 * Resolves a collation URI.
 * @param {string} [uri] - Collation URI; the default collation when absent
 * @param {{defaultCollation?: string}} [context]
 * @returns {Collation}
 * @throws {XPathError} FOCH0002 for an unsupported collation
 */
export function getCollation(uri, context = {}) {
  const name = uri ?? context.defaultCollation ?? CODEPOINT_COLLATION;
  if (name === CODEPOINT_COLLATION) return codepoint;
  if (name === HTML_ASCII_COLLATION) return htmlAscii;
  if (name === UCA_PREFIX || name.startsWith(`${UCA_PREFIX}?`)) {
    return ucaCollation(name);
  }
  throw new XPathError("FOCH0002", `Unsupported collation ${name}`);
}

/**
 * The collation named by an optional xs:string argument.
 * @param {Array<{value: string}>|undefined} sequence - The argument, or
 *   undefined for an arity without collation
 * @param {object} context
 * @returns {Collation}
 */
export const collationArg = (sequence, context) =>
  getCollation(sequence?.[0]?.value, context);
