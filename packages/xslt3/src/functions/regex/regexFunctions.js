/**
 * fn:matches, fn:replace and fn:tokenize (F&O 3.1 sections 5.6.3 to
 * 5.6.5).
 *
 * @module @tradik/xslt3/functions/regex/regexFunctions
 */

import { XPathError } from "../../errors.js";
import { normalizeWhitespace } from "../../xdm/strings.js";
import { booleanItem, define, stringArg, stringItem } from "../support.js";
import {
  allMatches,
  compileRegex,
  rejectEmptyMatch,
  testRegex,
} from "./compile.js";

/** @param {Array<*>|undefined} flags @returns {string} the flags argument */
const flagsArg = (flags) => (flags === undefined ? "" : flags[0].value);

/**
 * Parses a replacement string into literal text and group references.
 * @param {string} replacement
 * @param {number} groups - Number of capturing groups of the pattern
 * @returns {Array<string|number>} literal strings and group numbers
 * @throws {XPathError} FORX0004 for a "\" or "$" not used as an escape or
 *   a group reference
 */
export function parseReplacement(replacement, groups) {
  const parts = [];
  const isDigit = (c) => c >= "0" && c <= "9";
  for (let i = 0; i < replacement.length; i++) {
    const c = replacement[i];
    const next = replacement[i + 1] ?? "";
    if (c === "\\" && (next === "\\" || next === "$")) {
      parts.push(next);
      i++;
    } else if (c === "$" && isDigit(next)) {
      let number = Number(next);
      i++;
      while (
        isDigit(replacement[i + 1] ?? "") &&
        number * 10 + Number(replacement[i + 1]) <= groups
      ) {
        number = number * 10 + Number(replacement[++i]);
      }
      parts.push(number);
    } else if (c === "\\" || c === "$") {
      throw new XPathError(
        "FORX0004",
        `Invalid replacement string: ${replacement}`,
      );
    } else {
      parts.push(c);
    }
  }
  return parts;
}

/**
 * fn:replace on strings.
 * @param {string} input
 * @param {string} pattern
 * @param {string} replacement
 * @param {string} [flags=""]
 * @returns {string}
 */
export function replace(input, pattern, replacement, flags = "") {
  const compiled = compileRegex(pattern, flags);
  const parts = compiled.literal
    ? [replacement]
    : parseReplacement(replacement, compiled.groups);
  rejectEmptyMatch(compiled);
  let result = "";
  let last = 0;
  for (const match of allMatches(compiled, input)) {
    result += input.slice(last, match.index);
    for (const part of parts) {
      result += typeof part === "number" ? (match[part] ?? "") : part;
    }
    last = match.index + match[0].length;
  }
  return result + input.slice(last);
}

/**
 * fn:tokenize on strings (the two- and three-argument forms).
 * @param {string} input
 * @param {string} pattern
 * @param {string} [flags=""]
 * @returns {string[]}
 */
export function tokenize(input, pattern, flags = "") {
  const compiled = compileRegex(pattern, flags);
  rejectEmptyMatch(compiled);
  if (input === "") return [];
  const tokens = [];
  let last = 0;
  for (const match of allMatches(compiled, input)) {
    tokens.push(input.slice(last, match.index));
    last = match.index + match[0].length;
  }
  tokens.push(input.slice(last));
  return tokens;
}

const matchesImpl = ([input, [pattern], flags]) => [
  booleanItem(
    testRegex(compileRegex(pattern.value, flagsArg(flags)), stringArg(input)),
  ),
];
const replaceImpl = ([input, [pattern], [replacement], flags]) => [
  stringItem(
    replace(
      stringArg(input),
      pattern.value,
      replacement.value,
      flagsArg(flags),
    ),
  ),
];
const tokenizeImpl = ([input, [pattern], flags]) =>
  tokenize(stringArg(input), pattern.value, flagsArg(flags)).map(stringItem);

const S = "xs:string";
const S_OPT = "xs:string?";

/** @type {import("../support.js").FunctionDefinition[]} */
export const regexFunctions = [
  define("matches", [S_OPT, S], "xs:boolean", matchesImpl),
  define("matches", [S_OPT, S, S], "xs:boolean", matchesImpl),
  define("replace", [S_OPT, S, S], S, replaceImpl),
  define("replace", [S_OPT, S, S, S], S, replaceImpl),
  define("tokenize", [S_OPT], "xs:string*", ([input]) => {
    const text = normalizeWhitespace(stringArg(input), "collapse");
    return text === "" ? [] : text.split(" ").map(stringItem);
  }),
  define("tokenize", [S_OPT, S], "xs:string*", tokenizeImpl),
  define("tokenize", [S_OPT, S, S], "xs:string*", tokenizeImpl),
];
