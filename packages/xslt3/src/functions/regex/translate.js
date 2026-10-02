/**
 * Translator of XPath 3.1 regular expressions (F&O 3.1 section 5.6.1:
 * XSD 1.1 regular expressions plus ^ and $ anchors, reluctant quantifiers,
 * back-references and non-capturing groups) and their flags (s, m, i, x,
 * q) into JavaScript RegExp source for the `u` flag.
 *
 * Semantics kept from XPath rather than JS: "." excludes only \n and \r
 * (everything with the s flag), multi-line ^ and $ only see \n as a line
 * end, \d \w \s \i \c follow XSD, and lookaround, \b, \x and other JS-only
 * syntax are rejected with FORX0002. JS's own `s` and `m` flags are never
 * used; their effects are written into the expression.
 *
 * @module @tradik/xslt3/functions/regex/translate
 */

import { XPathError } from "../../errors.js";
import { jsChar } from "./escapes.js";
import { RegexParser } from "./parser.js";

/**
 * @typedef {object} TranslatedRegex
 * @property {string} source - JS RegExp source
 * @property {string} flags - JS flags: "u" or "iu"
 * @property {number} groups - Number of capturing groups
 * @property {number[]} parents - Enclosing group of each group (index =
 *   group number, 0 for the whole match)
 */

/** Whether JS supports the (?-i:...) modifier (V8 12.5, Node 23). */
export const MODIFIERS = (() => {
  try {
    return new RegExp("(?-i:a)", "iu").test("a");
    /* node:coverage ignore next 3 */
  } catch {
    return false;
  }
})();

const XML_SPACE = new Set([" ", "\t", "\n", "\r"]);

/**
 * Removes whitespace outside character classes (the x flag).
 * @param {string} pattern
 * @returns {string}
 */
export function stripWhitespace(pattern) {
  let result = "";
  let depth = 0;
  const chars = Array.from(pattern);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "\\") {
      // the escaped character is the next one after removed whitespace
      if (depth === 0) {
        while (XML_SPACE.has(chars[i + 1])) i++;
      }
      result += c + (chars[++i] ?? "");
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]" && depth > 0) depth--;
    if (depth > 0 || !XML_SPACE.has(c)) result += c;
  }
  return result;
}

/**
 * Translates an XPath regular expression and its flags.
 * @param {string} pattern
 * @param {string} [flags=""]
 * @returns {TranslatedRegex}
 * @throws {XPathError} FORX0001 for invalid flags, FORX0002 for an invalid
 *   pattern
 */
export function translateRegex(pattern, flags = "") {
  if (!/^[smixq]*$/.test(flags)) {
    throw new XPathError(
      "FORX0001",
      `Invalid regular expression flags "${flags}"`,
    );
  }
  const jsFlags = flags.includes("i") ? "iu" : "u";
  if (flags.includes("q")) {
    const source = Array.from(pattern, (c) => jsChar(c.codePointAt(0))).join(
      "",
    );
    return { source, flags: jsFlags, groups: 0, parents: [0] };
  }
  const text = flags.includes("x") ? stripWhitespace(pattern) : pattern;
  const translator = new RegexParser(text, {
    dotAll: flags.includes("s"),
    multiLine: flags.includes("m"),
    caseless: flags.includes("i") && MODIFIERS,
  });
  const source = translator.translate();
  return {
    source,
    flags: jsFlags,
    groups: translator.groups,
    parents: translator.parents,
  };
}
