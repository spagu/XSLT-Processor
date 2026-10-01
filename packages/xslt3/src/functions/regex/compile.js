/**
 * Compilation of XPath regular expressions to cached JS RegExp objects.
 *
 * @module @tradik/xslt3/functions/regex/compile
 */

import { XPathError } from "../../errors.js";
import { regexError } from "./escapes.js";
import { translateRegex } from "./translate.js";

/** Maximum number of compiled expressions kept. */
const CACHE_SIZE = 256;
const cache = new Map();

/**
 * @typedef {import("./translate.js").TranslatedRegex & {
 *   regex: RegExp, literal: boolean}} CompiledRegex
 * `regex` has the `g` and `d` flags; `literal` is true for the q flag.
 */

/**
 * Translates and compiles a pattern, reusing earlier compilations.
 * @param {string} pattern
 * @param {string} [flags=""]
 * @returns {CompiledRegex}
 * @throws {XPathError} FORX0001, FORX0002
 */
export function compileRegex(pattern, flags = "") {
  const key = `${flags}\u0000${pattern}`;
  let compiled = cache.get(key);
  if (compiled === undefined) {
    const translated = translateRegex(pattern, flags);
    let regex;
    // the translator only emits valid syntax: the catch is a safety net
    try {
      regex = new RegExp(translated.source, `${translated.flags}gd`);
      /* node:coverage ignore next 3 */
    } catch (error) {
      regexError(error.message);
    }
    compiled = { ...translated, regex, literal: flags.includes("q") };
    if (cache.size >= CACHE_SIZE) cache.clear();
    cache.set(key, compiled);
  }
  return compiled;
}

/**
 * All matches of a compiled expression in a string, left to right.
 * @param {CompiledRegex} compiled
 * @param {string} input
 * @returns {RegExpExecArray[]} with `indices`
 */
export function allMatches(compiled, input) {
  compiled.regex.lastIndex = 0;
  return Array.from(input.matchAll(compiled.regex));
}

/**
 * Whether a compiled expression matches somewhere in a string.
 * @param {CompiledRegex} compiled
 * @param {string} input
 * @returns {boolean}
 */
export function testRegex(compiled, input) {
  compiled.regex.lastIndex = 0;
  return compiled.regex.test(input);
}

/**
 * @param {CompiledRegex} compiled
 * @throws {XPathError} FORX0003 when the expression matches ""
 */
export function rejectEmptyMatch(compiled) {
  if (testRegex(compiled, "")) {
    throw new XPathError(
      "FORX0003",
      "The regular expression matches a zero-length string",
    );
  }
}
