/**
 * Output Escaping Helpers
 *
 * Character escaping rules for the xml, xhtml and html output methods
 * (XSLT 1.0 section 16).
 */

const XML_TEXT_ESCAPES = { "&": "&amp;", "<": "&lt;", "\r": "&#13;" };

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
 * "minimal escaping" rule of XSLT 1.0 section 16.1. A carriage return is
 * written as `&#13;`, as libxml2 does, since an XML parser would turn a
 * literal one into a line feed.
 *
 * @param {string} value - Text content
 * @returns {string} Escaped text
 *
 * @example
 * escapeXmlText("a<b\r"); // "a&lt;b&#13;"
 */
export function escapeXmlText(value) {
  return escapeWith(value, /[&<\r]/g, XML_TEXT_ESCAPES).replaceAll(
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

/** Leading HTML whitespace, which libxml2 writes unescaped. */
const LEADING_HTML_SPACE = /^[ \t\n\f\r]*/;

/** Runs of spaces, control characters, DEL and characters outside ASCII. */
const URI_UNSAFE_RUN = /[^!-~]+/gu;

/**
 * %-escape a URI attribute value as libxml2's HTML serializer does (and so
 * Chrome's XSLTProcessor): after any leading HTML whitespace, which is kept,
 * spaces, control characters, DEL and non-ASCII characters become the
 * %-escaped bytes of their UTF-8 encoding (XSLT 1.0 section 16.2, HTML 4.01
 * appendix B.2.1). Printable ASCII, `%` included, is kept as it is.
 *
 * @param {string} value - Attribute value
 * @returns {string} The escaped value
 *
 * @example
 * escapeUriAttribute("/café?q=a b"); // "/caf%C3%A9?q=a%20b"
 */
export function escapeUriAttribute(value) {
  const text = String(value);
  const leading = LEADING_HTML_SPACE.exec(text)[0];
  const encoder = new globalThis.TextEncoder();
  const rest = text
    .slice(leading.length)
    .replaceAll(URI_UNSAFE_RUN, (run) =>
      Array.from(
        encoder.encode(run),
        (byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`,
      ).join(""),
    );
  return leading + rest;
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
