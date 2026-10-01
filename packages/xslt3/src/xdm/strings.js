/**
 * String helpers of the data model: the whiteSpace facet, the xs:boolean
 * lexical space and codepoint string comparison.
 *
 * @module @tradik/xslt3/xdm/strings
 */

/**
 * Applies a whiteSpace facet value (XSD 1.1 Part 2 section 4.3.6). Only the
 * XML whitespace characters (space, tab, CR, LF) are affected.
 * @param {string} text
 * @param {"preserve"|"replace"|"collapse"} mode
 * @returns {string}
 */
export function normalizeWhitespace(text, mode) {
  if (mode === "preserve") return text;
  const replaced = text.replace(/[\t\n\r]/g, " ");
  // not String#trim, which also strips non-XML whitespace such as U+00A0
  return mode === "replace"
    ? replaced
    : replaced.replace(/ {2,}/g, " ").replace(/^ | $/g, "");
}

/**
 * Parses the xs:boolean lexical forms "true", "false", "1", "0".
 * @param {string} text - Whitespace-collapsed
 * @returns {boolean|null} null when invalid
 */
export function parseBoolean(text) {
  if (text === "true" || text === "1") return true;
  if (text === "false" || text === "0") return false;
  return null;
}

/**
 * Compares strings by Unicode codepoints (the default collation), unlike
 * the JS operators, which compare UTF-16 code units.
 * @param {string} a
 * @param {string} b
 * @returns {number} -1, 0 or 1
 */
export function compareCodepoints(a, b) {
  if (a === b) return 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a.codePointAt(i);
    const y = b.codePointAt(i);
    if (x !== y) return x < y ? -1 : 1;
    if (x > 0xffff) i++;
  }
  return a.length < b.length ? -1 : 1;
}
