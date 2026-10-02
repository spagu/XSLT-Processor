/**
 * The characters of JSON strings, with the escape sequences they were
 * written with (fn:parse-json, fn:json-to-xml and the escaped strings of
 * fn:xml-to-json).
 *
 * @module @tradik/xslt3/functions/json/jsonChars
 */

import { XPathError } from "../../errors.js";

/**
 * A character of a JSON string: its codepoint and, when it was written
 * as an escape sequence, the sequence ("\\n", "\\uD834").
 * @typedef {{cp: number, escape?: string}} JsonChar
 */

const SIMPLE_ESCAPES = {
  '"': 0x22,
  "\\": 0x5c,
  "/": 0x2f,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
};
const HEX4 = /[0-9A-Fa-f]{4}/y;

/**
 * Reads the characters of a JSON string body.
 * @param {string} text
 * @param {number} start - Offset after the opening quote
 * @param {(message: string) => never} fail - Raises the error
 * @param {boolean} [quoted=true] - Ends at an unescaped quote, which must
 *   come, and rejects control characters; else reads to the end
 * @returns {{chars: JsonChar[], end: number}} the characters and the
 *   offset of the closing quote (of the end)
 */
export function scanChars(text, start, fail, quoted = true) {
  const chars = [];
  let pos = start;
  for (;;) {
    const cp = text.codePointAt(pos);
    if (cp === undefined) {
      if (quoted) fail("unterminated string");
      break;
    }
    if (quoted && cp === 0x22) break;
    if (quoted && cp < 0x20) fail("control character in a string");
    if (cp !== 0x5c) {
      chars.push({ cp });
      pos += cp > 0xffff ? 2 : 1;
      continue;
    }
    const char = text[pos + 1];
    if (char === "u") {
      HEX4.lastIndex = pos + 2;
      if (!HEX4.test(text)) fail("invalid \\u escape");
      const escape = text.slice(pos, pos + 6);
      chars.push({ cp: parseInt(escape.slice(2), 16), escape });
      pos += 6;
    } else if (char !== undefined && Object.hasOwn(SIMPLE_ESCAPES, char)) {
      chars.push({ cp: SIMPLE_ESCAPES[char], escape: `\\${char}` });
      pos += 2;
    } else {
      fail(`invalid escape \\${char ?? ""}`);
    }
  }
  return { chars: pairSurrogates(chars), end: pos };
}

/**
 * The characters of a string that holds JSON escape sequences (the
 * content of an fn:xml-to-json string or key marked as escaped).
 * @param {string} text
 * @returns {JsonChar[]}
 * @throws {XPathError} FOJS0007 for an invalid escape sequence
 */
export function unescapeJsonChars(text) {
  const fail = (message) => {
    throw new XPathError("FOJS0007", `Invalid JSON escape: ${message}`);
  };
  return scanChars(text, 0, fail, false).chars;
}

/**
 * Joins escaped surrogate pairs (\uD834\uDD1E) into one character.
 * @param {JsonChar[]} chars
 * @returns {JsonChar[]}
 */
function pairSurrogates(chars) {
  const result = [];
  for (let i = 0; i < chars.length; i++) {
    const high = chars[i];
    const low = chars[i + 1];
    if (
      high.cp >= 0xd800 &&
      high.cp <= 0xdbff &&
      low?.cp >= 0xdc00 &&
      low.cp <= 0xdfff
    ) {
      const cp = (high.cp - 0xd800) * 0x400 + (low.cp - 0xdc00) + 0x10000;
      result.push({ cp, escape: `${high.escape ?? ""}${low.escape ?? ""}` });
      i++;
    } else {
      result.push(high);
    }
  }
  return result;
}
