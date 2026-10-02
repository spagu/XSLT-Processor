/**
 * File-type detectors shared by the analysers: the extensions each one
 * reads, whether an XML head is a stylesheet, and the `<?xml-stylesheet?>`
 * instruction that makes the browser run XSLT on a document. The code and
 * stylesheet analysers live in ./analysis/.
 *
 * @module xslt-migrate-check/detectors
 */

/** Script and template extensions searched for XSLTProcessor calls. */
export const SCRIPT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
  ".astro",
  ".html",
  ".htm",
  ".php",
  ".erb",
  ".ejs",
  ".hbs",
  ".twig",
  ".cshtml",
  ".jsp",
]);

/** HTML extensions, also searched for `type="text/xsl"` links. */
export const HTML_EXTENSIONS = new Set([".html", ".htm"]);

/** Extensions that always hold an XSL stylesheet. */
export const STYLESHEET_EXTENSIONS = new Set([".xsl", ".xslt"]);

/** XML extensions inspected for a stylesheet root or an xml-stylesheet PI. */
export const XML_EXTENSIONS = new Set([".xml", ".rdf", ".rss", ".atom"]);

/**
 * The lower-case extension of a path, with the dot ("" when it has none).
 *
 * @param {string} path - A path with `/` separators
 * @returns {string} e.g. ".xsl"
 */
export function extensionOf(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * Marks the HTML report this tool writes, so a later scan of the same
 * directory skips it instead of reading its quoted code as usages.
 */
export const REPORT_GENERATOR = "xslt-migrate-check";

/** How many leading bytes of an XML file decide what it is. */
export const HEAD_BYTES = 4096;

const LINE_TEXT_LIMIT = 100;
/** The root element of a stylesheet, its attributes in group 1. */
export const STYLESHEET_ROOT_PATTERN =
  /<xsl:(?:stylesheet|transform)\b([^>]*)>/;
const XML_STYLESHEET_PI_PATTERN = /<\?xml-stylesheet\b([\s\S]*?)\?>/;
const RENDERED_TYPES = new Set([
  "text/xsl",
  "application/xslt+xml",
  "application/xml",
]);

/**
 * Trim a source line for the report: surrounding whitespace removed and at
 * most LINE_TEXT_LIMIT characters.
 *
 * @param {string} text - A source line
 * @returns {string} The trimmed line, with an ellipsis when cut
 */
export function trimLine(text) {
  const trimmed = text.trim();
  return trimmed.length > LINE_TEXT_LIMIT
    ? `${trimmed.slice(0, LINE_TEXT_LIMIT - 1)}…`
    : trimmed;
}

/**
 * The 1-based line of a character offset.
 *
 * @param {string} text - The text
 * @param {number} index - Offset into the text
 * @returns {number} Line number
 */
export function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

/**
 * Read one pseudo-attribute (`name="value"` or `name='value'`) from a tag.
 *
 * @param {string} attributes - The text between the tag name and `>`
 * @param {string} name - Attribute name
 * @returns {string|null} The value, or null when absent
 */
export function readAttribute(attributes, name) {
  const match = new RegExp(String.raw`\b${name}\s*=\s*["']([^"']*)["']`).exec(
    attributes,
  );
  return match ? match[1].trim() : null;
}

/**
 * Tell whether the head of an XML file is an XSL stylesheet.
 *
 * @param {string} head - First bytes of the file as text
 * @returns {boolean} True for `<xsl:stylesheet` or `<xsl:transform` roots
 */
export function isStylesheetHead(head) {
  return STYLESHEET_ROOT_PATTERN.test(head);
}

/**
 * @typedef {object} XmlStylesheetPi
 * @property {number} line - 1-based line of the processing instruction
 * @property {string} href - The stylesheet reference, or "" when absent
 * @property {string} type - The declared type
 */

/**
 * Find an `<?xml-stylesheet?>` processing instruction that makes the browser
 * run XSLT on the document (type text/xsl, application/xslt+xml or
 * application/xml).
 *
 * @param {string} head - First bytes of the XML file as text
 * @returns {XmlStylesheetPi|null} The instruction, or null when none applies
 */
export function detectXmlStylesheetPi(head) {
  const match = XML_STYLESHEET_PI_PATTERN.exec(head);
  if (!match) return null;
  const type = readAttribute(match[1], "type");
  if (!type || !RENDERED_TYPES.has(type.toLowerCase())) return null;
  const line = lineAt(head, match.index);
  return { line, href: readAttribute(match[1], "href") || "", type };
}
