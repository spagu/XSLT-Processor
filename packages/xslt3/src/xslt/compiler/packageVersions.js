/**
 * Package versions and version ranges (XSLT 3.0 section 3.5.1): parsing,
 * ordering, and matching a version against the range of an
 * xsl:use-package declaration.
 *
 * @module @tradik/xslt3/xslt/compiler/packageVersions
 */

import { xsltError } from "../names.js";

/**
 * Parses a package version into its portions: integers (BigInt) and an
 * optional final NCName.
 * @param {string} text - `NumericPart ("-" NamePart)?`
 * @param {boolean} [keepZeros] - Keep trailing zero portions (prefixes)
 * @returns {Array<bigint|string>|null} null when the syntax is wrong
 */
export function parseVersion(text, keepZeros = false) {
  const match = /^(\d+(?:\.\d+)*)(?:-(.+))?$/.exec(text.trim());
  // the name part is an NCName; any name without ":" is accepted
  if (!match || match[2]?.includes(":")) return null;
  const portions = match[1].split(".").map(BigInt);
  if (!keepZeros) {
    while (portions.length > 1 && portions.at(-1) === 0n) portions.pop();
  }
  if (match[2] !== undefined) portions.push(match[2]);
  return portions;
}

/**
 * Compares two portions: integers numerically, names by code point, a
 * name before an integer.
 * @param {bigint|string} a
 * @param {bigint|string} b
 * @returns {number}
 */
function comparePortion(a, b) {
  const aName = typeof a === "string";
  if (aName !== (typeof b === "string")) return aName ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compares two parsed versions.
 * @param {Array<bigint|string>} a
 * @param {Array<bigint|string>} b
 * @returns {number} negative, zero or positive
 */
export function compareVersions(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const order = comparePortion(a[i], b[i]);
    if (order !== 0) return order;
  }
  if (a.length === b.length) return 0;
  // the longer one is greater when its next portion is an integer
  const longer = a.length > b.length ? a : b;
  const sign = typeof longer[length] === "string" ? -1 : 1;
  return a.length > b.length ? sign : -sign;
}

/**
 * A version or a version prefix (`1.3.*`) of a range.
 * @param {string} text
 * @returns {{portions: Array<bigint|string>, prefix: boolean}}
 */
function parseBound(text) {
  const prefix = text.endsWith(".*");
  const portions = parseVersion(prefix ? text.slice(0, -2) : text, prefix);
  if (!portions) throw xsltError("XTSE0020", `Invalid version ${text}`);
  return { portions, prefix };
}

/**
 * Whether a version is at most some version matching a bound.
 * @param {Array<bigint|string>} version
 * @param {{portions: Array, prefix: boolean}} bound
 * @returns {boolean}
 */
function atMost(version, bound) {
  if (!bound.prefix) return compareVersions(version, bound.portions) <= 0;
  return (
    matchesPrefix(version, bound.portions) ||
    compareVersions(version, bound.portions) < 0
  );
}

/**
 * @param {Array<bigint|string>} version
 * @param {Array<bigint|string>} prefix
 * @returns {boolean} whether the leading portions of the version are the
 *   prefix
 */
function matchesPrefix(version, prefix) {
  const name = typeof version.at(-1) === "string" ? [version.at(-1)] : [];
  const numbers = version.slice(0, version.length - name.length);
  // trailing zeros were dropped: 1.0.* matches 1
  while (numbers.length < prefix.length) numbers.push(0n);
  const padded = [...numbers, ...name];
  return prefix.every((portion, i) => portion === padded[i]);
}

/**
 * Parses a version range into a predicate.
 * @param {string|undefined} text - The package-version attribute of
 *   xsl:use-package (absent: any version)
 * @returns {(version: Array<bigint|string>) => boolean}
 * @throws {import("../../errors.js").XPathError} XTSE0020 for a bad range
 */
export function parseVersionRange(text) {
  const range = (text ?? "*").trim();
  if (range === "*") return () => true;
  const tests = range.split(/\s*,\s*/).map((part) => {
    const to = /^(.*?)\s*\bto\s+(\S+)$/.exec(part);
    if (to) {
      const upper = parseBound(to[2]);
      if (to[1] === "") return (v) => atMost(v, upper);
      const lower = parseBound(to[1]);
      if (lower.prefix) throw xsltError("XTSE0020", `Invalid range ${part}`);
      return (v) => compareVersions(v, lower.portions) >= 0 && atMost(v, upper);
    }
    if (part.endsWith("+")) {
      const lower = parseBound(part.slice(0, -1));
      return (v) => compareVersions(v, lower.portions) >= 0;
    }
    const bound = parseBound(part);
    return bound.prefix
      ? (v) => matchesPrefix(v, bound.portions)
      : (v) => compareVersions(v, bound.portions) === 0;
  });
  return (version) => tests.some((test) => test(version));
}

/**
 * Whether a package version matches a version range.
 * @param {string} version - Package version (absent: "1")
 * @param {string} [range] - Version range (absent: "*")
 * @returns {boolean}
 */
export function versionMatches(version, range) {
  const parsed = parseVersion(version ?? "1");
  return parsed !== null && parseVersionRange(range)(parsed);
}
