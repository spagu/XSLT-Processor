/**
 * String algorithms of the EXSLT strings module, ported from libexslt
 * `strings.c`. They work on plain strings; `strings.js` binds them to XPath.
 * Lengths and positions count characters (Unicode code points).
 */

"use strict";

import { characters } from "./arguments.js";

/** Delimiters `str:tokenize()` uses without a second argument. */
export const DEFAULT_TOKENIZE_DELIMITERS = "\t\r\n ";

/** Longest string `str:padding()` builds (libexslt's limit). */
export const MAX_PADDING = 100000;

/**
 * `str:tokenize()`: split on any of the delimiter characters, dropping empty
 * tokens; an empty delimiter string makes every character a token.
 *
 * @param {string} str - The string to split
 * @param {string} delimiters - Delimiter characters
 * @returns {string[]} The tokens
 */
export function tokenizeString(str, delimiters) {
  const chars = characters(str);
  if (delimiters === "") return chars;

  const separators = new Set(characters(delimiters));
  const tokens = [];
  let token = "";
  for (const char of chars) {
    if (!separators.has(char)) {
      token += char;
    } else if (token !== "") {
      tokens.push(token);
      token = "";
    }
  }
  if (token !== "") tokens.push(token);
  return tokens;
}

/**
 * Lower-case the ASCII letters of a string, as libxml2 `xmlStrncasecmp`.
 *
 * @param {string} str - Any string
 * @returns {string} The string with A-Z lower-cased
 */
function asciiLowerCase(str) {
  return str.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/**
 * `str:split()`: split on a delimiter string, dropping empty tokens. As in
 * libexslt the delimiter matches ASCII letters case-insensitively, and an
 * empty delimiter makes every character a token.
 *
 * @param {string} str - The string to split
 * @param {string} delimiter - The delimiter
 * @returns {string[]} The tokens
 */
export function splitString(str, delimiter) {
  if (delimiter === "") return characters(str);

  const haystack = asciiLowerCase(str);
  const needle = asciiLowerCase(delimiter);
  const tokens = [];
  let start = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    if (at > start) tokens.push(str.substring(start, at));
    start = at + needle.length;
    at = haystack.indexOf(needle, start);
  }
  if (start < str.length) tokens.push(str.substring(start));
  return tokens;
}

/**
 * `str:padding(length, chars)`: repeat `chars` (a space when empty) and
 * truncate to `length` characters, capped at {@link MAX_PADDING}.
 *
 * @param {number} length - Requested length
 * @param {string} chars - Padding characters
 * @returns {string} The padding
 */
export function paddingString(length, chars) {
  if (Number.isNaN(length) || length < 1) return "";
  const count = Math.min(Math.trunc(length), MAX_PADDING);
  const pattern = characters(chars === "" ? " " : chars);
  const whole = Math.floor(count / pattern.length);
  return (
    pattern.join("").repeat(whole) +
    pattern.slice(0, count - whole * pattern.length).join("")
  );
}

/**
 * `str:align(string, padding, alignment)`: overlay the string on the padding
 * ("left" unless "right" or "center"), truncating a longer string.
 *
 * @param {string} str - The string to align
 * @param {string} padding - The padding it is placed on
 * @param {string|null} alignment - "left", "right" or "center"
 * @returns {string} The aligned string
 */
export function alignString(str, padding, alignment) {
  const text = characters(str);
  const pad = characters(padding);
  if (text.length >= pad.length) return text.slice(0, pad.length).join("");

  const free = pad.length - text.length;
  let left = 0;
  if (alignment === "right") left = free;
  else if (alignment === "center") left = Math.floor(free / 2);

  return (
    pad.slice(0, left).join("") + str + pad.slice(left + text.length).join("")
  );
}

/**
 * `str:replace()`: replace every occurrence of the search strings, longest
 * match first (the earliest search string on ties). Search string `i` is
 * replaced by replacement `i`, or removed when there is none. The first empty
 * search string with a non-empty replacement inserts that replacement between
 * the characters that no search string matches.
 *
 * @param {string} str - The string to process
 * @param {string[]} searches - Search strings
 * @param {Array<string|null>} replacements - Replacements by search index
 * @returns {string} The processed string
 */
export function replaceStrings(str, searches, replacements) {
  const replacementOf = (index) => replacements[index] ?? "";
  let emptyIndex = searches.indexOf("");
  if (emptyIndex !== -1 && replacementOf(emptyIndex) === "") emptyIndex = -1;

  let result = "";
  let start = 0;
  let at = 0;
  while (at < str.length) {
    let match = -1;
    searches.forEach((search, index) => {
      const longer = match === -1 || search.length > searches[match].length;
      if (search !== "" && longer && str.startsWith(search, at)) match = index;
    });

    if (match === -1) {
      if (emptyIndex !== -1 && start < at) {
        result += str.substring(start, at) + replacementOf(emptyIndex);
        start = at;
      }
      at += str.codePointAt(at) > 0xffff ? 2 : 1;
    } else {
      result += str.substring(start, at) + replacementOf(match);
      at += searches[match].length;
      start = at;
    }
  }
  return result + str.substring(start);
}
