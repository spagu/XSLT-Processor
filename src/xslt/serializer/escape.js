/**
 * Output Escaping Helpers
 *
 * Character escaping rules for the xml, xhtml and html output methods
 * (XSLT 1.0 section 16).
 */

const XML_TEXT_ESCAPES = { "&": "&amp;", "<": "&lt;" };

const HTML_TEXT_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

const XML_ATTRIBUTE_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "\t": "&#9;",
  "\n": "&#10;",
  "\r": "&#13;",
};

const HTML_ATTRIBUTE_ESCAPES = { "&": "&amp;", '"': "&quot;" };

/**
 * Replace every character matched by a pattern using a lookup table.
 *
 * @param {string} value - Text to escape
 * @param {RegExp} pattern - Global pattern selecting the characters to replace
 * @param {Record<string, string>} escapes - Character to replacement mapping
 * @returns {string} Escaped text
 */
function escapeWith(value, pattern, escapes) {
  return String(value).replaceAll(pattern, (character) => escapes[character]);
}

/**
 * Escape character data for the xml output method.
 *
 * `>` is only escaped where it would close a CDATA section, matching the
 * "minimal escaping" rule of XSLT 1.0 section 16.1.
 *
 * @param {string} value - Text content
 * @returns {string} Escaped text
 */
export function escapeXmlText(value) {
  return escapeWith(value, /[&<]/g, XML_TEXT_ESCAPES).replaceAll(
    "]]>",
    "]]&gt;",
  );
}

/**
 * Escape an attribute value for the xml output method.
 *
 * @param {string} value - Attribute value
 * @returns {string} Escaped value
 */
export function escapeXmlAttribute(value) {
  return escapeWith(value, /[&<>"\t\n\r]/g, XML_ATTRIBUTE_ESCAPES);
}

/**
 * Escape character data for the html output method.
 *
 * @param {string} value - Text content
 * @returns {string} Escaped text
 */
export function escapeHtmlText(value) {
  return escapeWith(value, /[&<>]/g, HTML_TEXT_ESCAPES);
}

/**
 * Escape an attribute value for the html output method.
 *
 * Only `&` and `"` are escaped: XSLT 1.0 section 16.2 keeps `<` unescaped
 * and `&` unescaped before `{` (HTML 4.0 script macros), as libxslt does.
 *
 * @param {string} value - Attribute value
 * @returns {string} Escaped value
 *
 * @example
 * escapeHtmlAttribute('&{x} & <b> "'); // '&{x} &amp; <b> &quot;'
 */
export function escapeHtmlAttribute(value) {
  return escapeWith(value, /&(?!\{)|"/g, HTML_ATTRIBUTE_ESCAPES);
}

/** Runs of characters outside ASCII. */
const NON_ASCII_RUN = /[\u{80}-\u{10FFFF}]+/gu;

/**
 * %-escape the non-ASCII characters of a URI attribute value as their UTF-8
 * bytes (XSLT 1.0 section 16.2, HTML 4.0 appendix B.2.1). ASCII characters,
 * `%` included, are kept as they are.
 *
 * @param {string} value - Attribute value
 * @returns {string} The value with only ASCII characters
 *
 * @example
 * escapeUriNonAscii("/café?q=1"); // "/caf%C3%A9?q=1"
 */
export function escapeUriNonAscii(value) {
  const encoder = new globalThis.TextEncoder();
  return String(value).replaceAll(NON_ASCII_RUN, (run) =>
    Array.from(
      encoder.encode(run),
      (byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`,
    ).join(""),
  );
}

/**
 * Wrap text in a CDATA section, splitting it around any `]]>` terminator.
 *
 * @param {string} value - Text content
 * @returns {string} One or more CDATA sections
 */
export function wrapCdata(value) {
  return `<![CDATA[${String(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}
