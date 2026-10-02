/**
 * Content detectors: given the text of one file, find browser-side
 * XSLTProcessor usages, describe an XSL stylesheet, or spot an XML document
 * that the browser renders through an `<?xml-stylesheet?>` instruction.
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

/** How many leading bytes of an XML file decide what it is. */
export const HEAD_BYTES = 4096;

const LINE_TEXT_LIMIT = 100;
const USAGE_PATTERN =
  /XSLTProcessor|importStylesheet\(|transformToFragment\(|transformToDocument\(/;
const HTML_XSL_PATTERN = /type=["']text\/xsl["']|<\?xml-stylesheet/;
const MIGRATED_PATTERN = /@tradik\/xslt-processor|XsltProcessorLib/;
const COMMENT_PATTERN = /^(\/\/|\/?\*|#)/;
const STYLESHEET_ROOT_PATTERN = /<xsl:(?:stylesheet|transform)\b([^>]*)>/;
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
 * Read one pseudo-attribute (`name="value"` or `name='value'`) from a tag.
 *
 * @param {string} attributes - The text between the tag name and `>`
 * @param {string} name - Attribute name
 * @returns {string|null} The value, or null when absent
 */
function readAttribute(attributes, name) {
  const match = new RegExp(String.raw`\b${name}\s*=\s*["']([^"']*)["']`).exec(
    attributes,
  );
  return match ? match[1].trim() : null;
}

/**
 * @typedef {object} UsageMatch
 * @property {number} line - 1-based line number
 * @property {string} text - The line, trimmed
 */

/**
 * Find browser-side XSLTProcessor usages in a script or template file. HTML
 * files also match `type="text/xsl"` links and `<?xml-stylesheet` PIs.
 * Lines that are clearly comments (`//`, `*`, `/*`, `#`) are ignored.
 *
 * @param {string} content - File text
 * @param {string} extension - Lower-case extension with the dot
 * @returns {{ matches: UsageMatch[], migrated: boolean }} The matching lines
 *   and whether the file already loads @tradik/xslt-processor
 */
export function detectUsages(content, extension) {
  const html = HTML_EXTENSIONS.has(extension);
  const matches = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (COMMENT_PATTERN.test(line.trim())) return;
    if (USAGE_PATTERN.test(line) || (html && HTML_XSL_PATTERN.test(line))) {
      matches.push({ line: index + 1, text: trimLine(line) });
    }
  });
  return { matches, migrated: MIGRATED_PATTERN.test(content) };
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
 * @typedef {object} StylesheetFacts
 * @property {string} version - Declared XSLT version, or "unknown"
 * @property {boolean} exslt - Uses an EXSLT namespace
 * @property {boolean} disableOutputEscaping - Uses disable-output-escaping
 * @property {boolean} documentFunction - Calls document()
 * @property {boolean} key - Declares xsl:key
 * @property {boolean} msxml - Uses MSXML-only extensions (msxsl:)
 */

/**
 * Describe an XSL stylesheet: its version and the features that matter when
 * a JavaScript processor replaces the browser's.
 *
 * @param {string} content - Stylesheet text
 * @returns {StylesheetFacts} The facts found
 */
export function detectStylesheet(content) {
  const root = STYLESHEET_ROOT_PATTERN.exec(content);
  const version = root ? readAttribute(root[1], "version") : null;
  return {
    version: version || "unknown",
    // A namespace name is an identifier compared as a string, never fetched
    exslt: content.includes("http://exslt.org/"), // NOSONAR
    disableOutputEscaping: content.includes("disable-output-escaping"),
    documentFunction: /\bdocument\s*\(/.test(content),
    key: content.includes("<xsl:key"),
    msxml:
      content.includes("msxsl:") ||
      content.includes("urn:schemas-microsoft-com:xslt"),
  };
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
  const line = head.slice(0, match.index).split("\n").length;
  return { line, href: readAttribute(match[1], "href") || "", type };
}
