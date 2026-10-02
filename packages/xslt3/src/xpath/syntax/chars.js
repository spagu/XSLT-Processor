/**
 * Character classes of the XPath 3.1 lexical structure (Appendix A.2).
 *
 * Names use the XML 1.0 (fifth edition) name characters, which are also
 * those of XML 1.1, so the xml-version constraint (A.1.2) needs no switch.
 *
 * @module @tradik/xslt3/xpath/syntax/chars
 */

const NAME_START =
  "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D" +
  "\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF" +
  "\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;

/** NCName (sticky). */
// The combining marks U+0300-U+036F are NameChars on their own, as XML says.
// eslint-disable-next-line no-misleading-character-class
export const NCNAME = new RegExp(`[${NAME_START}][${NAME_CHAR}]*`, "uy");
/** One NameStartChar without ":" (sticky). */
export const NAME_START_CHAR = new RegExp(`[${NAME_START}]`, "uy");
/** IntegerLiteral, DecimalLiteral or DoubleLiteral (sticky). */
export const NUMBER = /(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][+-]?[0-9]+)?/y;
/** XML whitespace (sticky). */
export const WHITESPACE = /[ \t\r\n]+/y;

/**
 * Returns the match of a sticky regular expression at an offset.
 *
 * @param {RegExp} pattern - Sticky (`y`) pattern
 * @param {string} text - Source
 * @param {number} offset - Where the match must start
 * @returns {string|null} The matched text, or null
 */
export function matchAt(pattern, text, offset) {
  pattern.lastIndex = offset;
  const match = pattern.exec(text);
  return match ? match[0] : null;
}

/**
 * @param {string} text - Candidate name
 * @returns {boolean} Whether the whole text is an NCName
 */
export function isNCName(text) {
  return matchAt(NCNAME, text, 0) === text;
}

/**
 * Whitespace normalization of xs:anyURI and normalize-space(): runs of
 * whitespace become one space, leading and trailing ones are removed.
 *
 * @param {string} text - Text
 * @returns {string} Normalized text
 */
export function normalizeSpace(text) {
  return text.replace(/[ \t\r\n]+/g, " ").trim();
}
