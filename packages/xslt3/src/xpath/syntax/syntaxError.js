/**
 * Construction of XPath static errors that point into the source text.
 *
 * @module @tradik/xslt3/xpath/syntax/syntaxError
 */

import { XPathError } from "../../errors.js";

/** Characters of context shown on each side of the error offset. */
const EXCERPT_RADIUS = 20;

/**
 * Builds an error whose message names the offset and shows the source around
 * it, with "^" marking the offset, e.g. `... at offset 4: "1 + ^)"`.
 *
 * @param {string} source - The whole expression
 * @param {number} offset - Offset (UTF-16 code units) where the problem is
 * @param {string} message - What is wrong
 * @param {string} [code] - Error code, XPST0003 (syntax error) by default
 * @returns {XPathError} The error, for the caller to throw
 */
export function syntaxError(source, offset, message, code = "XPST0003") {
  const from = Math.max(0, offset - EXCERPT_RADIUS);
  const to = Math.min(source.length, offset + EXCERPT_RADIUS);
  const before = (from > 0 ? "..." : "") + source.slice(from, offset);
  const after = source.slice(offset, to) + (to < source.length ? "..." : "");
  return new XPathError(
    code,
    `${message} at offset ${offset}: ${JSON.stringify(before + "^" + after)}`,
  );
}
