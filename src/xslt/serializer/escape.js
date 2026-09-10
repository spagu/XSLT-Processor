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

const HTML_ATTRIBUTE_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/**
 * Replace every character matched by a pattern using a lookup table.
 *
 * @param {string} value - Text to escape
 * @param {RegExp} pattern - Global pattern selecting the characters to replace
 * @param {Record<string, string>} escapes - Character to replacement mapping
 * @returns {string} Escaped text
 */
function escapeWith(value, pattern, escapes) {
  return String(value).replace(pattern, (character) => escapes[character]);
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
  return escapeWith(value, /[&<]/g, XML_TEXT_ESCAPES).replace(/]]>/g, "]]&gt;");
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
 * URI attributes keep their reserved characters; only markup significant
 * characters are escaped (XSLT 1.0 section 16.2).
 *
 * @param {string} value - Attribute value
 * @returns {string} Escaped value
 */
export function escapeHtmlAttribute(value) {
  return escapeWith(value, /[&<>"]/g, HTML_ATTRIBUTE_ESCAPES);
}

/**
 * Wrap text in a CDATA section, splitting it around any `]]>` terminator.
 *
 * @param {string} value - Text content
 * @returns {string} One or more CDATA sections
 */
export function wrapCdata(value) {
  return `<![CDATA[${String(value).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}
