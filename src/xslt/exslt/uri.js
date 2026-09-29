/**
 * `str:encode-uri()` / `str:decode-uri()` algorithms, following libexslt
 * `strings.c` and libxml2 `xmlURIEscapeStr()` / `xmlURIUnescapeString()`.
 *
 * Only UTF-8 is supported: any other encoding argument (the name is compared
 * case-sensitively, as libexslt does) yields the empty string, as does a
 * string that is not well-formed Unicode or decodes to malformed UTF-8.
 */

"use strict";

/** The only encoding name the functions accept. */
export const URI_ENCODING = "UTF-8";

/** Characters never escaped: RFC 2396 "mark" characters (letters and digits aside). */
const MARKS = "-_.!~*'()";

/** Reserved characters kept when `escape-reserved` is false. */
const RESERVED = ";/?:@&=+$,[]";

/**
 * Whether a string contains an unpaired surrogate, which has no UTF-8 form.
 *
 * @param {string} str - Any string
 * @returns {boolean} True when the string is not well-formed
 */
function hasLoneSurrogate(str) {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
    str,
  );
}

/**
 * Percent-encode the UTF-8 bytes of one character, in upper case hex.
 *
 * @param {string} char - One character (code point)
 * @returns {string} The escaped bytes
 */
function escapeBytes(char) {
  const code = char.codePointAt(0);
  if (code < 0x80) {
    return `%${code.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return encodeURIComponent(char);
}

/**
 * `str:encode-uri(string, escape-reserved, encoding?)`.
 *
 * @param {string} str - The string to escape
 * @param {boolean} escapeReserved - Whether reserved characters are escaped too
 * @param {string} [encoding] - Must be "UTF-8" when given
 * @returns {string} The escaped string, "" on failure
 */
export function encodeUri(str, escapeReserved, encoding = URI_ENCODING) {
  if (encoding !== URI_ENCODING || hasLoneSurrogate(str)) return "";

  const kept = escapeReserved ? MARKS : MARKS + RESERVED;
  let result = "";
  for (const char of str) {
    const unescaped = /^[A-Za-z0-9]$/.test(char) || kept.includes(char);
    result += unescaped ? char : escapeBytes(char);
  }
  return result;
}

/**
 * `str:decode-uri(string, encoding?)`: decode every `%XX` escape (a `%` not
 * followed by two hex digits stays as is); the decoded bytes must be UTF-8.
 * As the result is a C string in libexslt, it ends at a decoded NUL byte.
 *
 * @param {string} str - The string to unescape
 * @param {string} [encoding] - Must be "UTF-8" when given
 * @returns {string} The unescaped string, "" on failure
 */
export function decodeUri(str, encoding = URI_ENCODING) {
  if (encoding !== URI_ENCODING || hasLoneSurrogate(str)) return "";

  // Re-escape everything but valid escapes, then let the platform decode the
  // bytes: decodeURIComponent throws on malformed UTF-8.
  const escaped = str.replace(/%(?![0-9A-Fa-f]{2})|[^%]+/gu, (text) =>
    text === "%" ? "%25" : encodeURIComponent(text),
  );

  try {
    const decoded = decodeURIComponent(escaped);
    const nul = decoded.indexOf("\0");
    return nul === -1 ? decoded : decoded.substring(0, nul);
  } catch {
    return "";
  }
}
