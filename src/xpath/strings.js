/**
 * String and number conversions of the XPath 1.0 data model.
 *
 * JavaScript's own conversions are close to XPath's but not equal: `\s` and
 * `trim()` know Unicode spaces, `Number()` reads exponents, hexadecimal and
 * `Infinity`, `String()` writes exponents, and string indexes count UTF-16
 * code units. The helpers here follow the recommendation instead: XML
 * whitespace only (#x20 #x9 #xD #xA), the Number grammar of section 4.4, the
 * decimal form of section 4.2 and characters counted as code points.
 *
 * @module xpath/strings
 */

/** A run of XML whitespace characters. */
const XML_WHITESPACE_RUN = /[ \t\r\n]+/g;

/**
 * Whether a character is XML whitespace (#x20, #x9, #xD, #xA).
 *
 * @param {string} char - A single character
 * @returns {boolean} True for XML whitespace
 */
function isXmlSpace(char) {
  return char === " " || char === "\t" || char === "\r" || char === "\n";
}

/**
 * Strip leading and trailing XML whitespace in linear time (a regular
 * expression such as `/\s+$/` backtracks quadratically on long runs).
 *
 * @param {string} str - Any string
 * @returns {string} The trimmed string
 */
export function trimXmlSpace(str) {
  let start = 0;
  let end = str.length;
  while (start < end && isXmlSpace(str[start])) start++;
  while (end > start && isXmlSpace(str[end - 1])) end--;
  return str.slice(start, end);
}

/** `S? '-'? (Digits ('.' Digits?)? | '.' Digits) S?` (XPath 4.4 number()). */
const XPATH_NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Any UTF-16 surrogate code unit. */
const SURROGATE = /[\uD800-\uDFFF]/;

/**
 * Strip leading and trailing XML whitespace and collapse inner runs of it to
 * one space, as `normalize-space()` does.
 *
 * @param {string} str - Any string
 * @returns {string} The normalized string
 *
 * @example
 * normalizeXmlSpace(" a \n b "); // "a b" - a no-break space is kept
 */
export function normalizeXmlSpace(str) {
  return trimXmlSpace(str).replace(XML_WHITESPACE_RUN, " ");
}

/**
 * Split a string on XML whitespace, dropping empty tokens.
 *
 * @param {string} str - Whitespace separated tokens
 * @returns {string[]} The tokens
 */
export function splitXmlSpace(str) {
  return str.split(XML_WHITESPACE_RUN).filter((token) => token !== "");
}

/**
 * Convert a string to a number following the XPath Number grammar: optional
 * XML whitespace, an optional minus sign, digits with an optional decimal
 * point. Anything else, including the empty string, is NaN.
 *
 * @param {string} str - The string to convert
 * @returns {number} The number, or NaN
 *
 * @example
 * parseXPathNumber(" -3.5 "); // -3.5
 * parseXPathNumber("1e3"); // NaN
 */
export function parseXPathNumber(str) {
  const trimmed = trimXmlSpace(str);
  if (!XPATH_NUMBER.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

/**
 * Convert a number to its XPath string form: NaN, Infinity and -Infinity by
 * name, zero as "0", every other number in decimal notation without an
 * exponent. The digits are those of `Number#toString`; exponent forms are
 * rewritten by moving the decimal point in the string, so no floating point
 * arithmetic can alter them.
 *
 * @param {number} value - The number
 * @returns {string} The string form
 *
 * @example
 * formatXPathNumber(1e21); // "1000000000000000000000"
 * formatXPathNumber(1e-7); // "0.0000001"
 */
export function formatXPathNumber(value) {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  if (value === 0) return "0";

  const text = String(value);
  const exponentAt = text.indexOf("e");
  if (exponentAt === -1) return text;

  // Exponent forms are "d.ddde+NN" (|value| >= 1e21) or "d.ddde-N" (< 1e-6)
  const sign = value < 0 ? "-" : "";
  const exponent = Number(text.substring(exponentAt + 1));
  const digits = text.substring(sign.length, exponentAt).replace(".", "");

  if (exponent < 0) {
    return `${sign}0.${"0".repeat(-exponent - 1)}${digits}`;
  }
  return sign + digits + "0".repeat(exponent + 1 - digits.length);
}

/**
 * Number of characters (Unicode code points) in a string.
 *
 * @param {string} str - Any string
 * @returns {number} The number of code points
 */
export function codePointLength(str) {
  if (!SURROGATE.test(str)) return str.length;
  return Array.from(str).length;
}

/**
 * XPath `substring()` on code points: the characters whose 1-based position
 * p satisfies `p >= round(start)` and, with a length, `p < round(start) +
 * round(length)`. NaN and infinite arguments follow from those comparisons.
 *
 * @param {string} str - The string
 * @param {number} start - Start position, not yet rounded
 * @param {number} [length] - Number of characters, not yet rounded
 * @returns {string} The substring
 *
 * @example
 * xpathSubstring("12345", 1.5, 2.6); // "234"
 */
export function xpathSubstring(str, start, length) {
  const first = Math.round(start);
  const end = length === undefined ? Infinity : first + Math.round(length);
  const from = Math.max(first, 1);
  if (Number.isNaN(end) || Number.isNaN(from) || end <= from) return "";

  const chars = SURROGATE.test(str) ? Array.from(str) : null;
  if (chars === null) return str.slice(from - 1, end - 1);
  return chars.slice(from - 1, end - 1).join("");
}

/**
 * XPath `translate()` on code points: each character of `str` found in
 * `from` is replaced by the character at the same position in `to`, or
 * removed when `to` is shorter. The first occurrence in `from` wins.
 *
 * @param {string} str - The string to translate
 * @param {string} from - Characters to replace
 * @param {string} to - Replacement characters
 * @returns {string} The translated string
 */
export function xpathTranslate(str, from, to) {
  const fromChars = Array.from(from);
  const toChars = Array.from(to);
  let result = "";
  for (const char of str) {
    const index = fromChars.indexOf(char);
    if (index === -1) {
      result += char;
    } else if (index < toChars.length) {
      result += toChars[index];
    }
  }
  return result;
}
