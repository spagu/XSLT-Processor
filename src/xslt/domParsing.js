/**
 * XML parsing through whatever DOM implementation is available.
 *
 * Stylesheets pulled in by xsl:import/xsl:include and documents returned by a
 * `document()` loader may be XML strings. They are parsed with, in order: a
 * DOMParser given to the engine (`domParser` option), the global
 * `DOMParser` (browsers, or a jsdom/xmldom global installed by the host), or
 * the DOMParser of the window owning the stylesheet document. Parse errors are
 * detected through `getElementsByTagName`, which every DOM implementation
 * has (xmldom, for one, has no `querySelector`).
 *
 * @module xslt/domParsing
 */

"use strict";

/**
 * Namespace Gecko puts its `parsererror` element in. A namespace name is an
 * identifier compared as a string, never fetched, so http is correct here.
 */
const GECKO_PARSER_ERROR_NS =
  "http://www.mozilla.org/newlayout/xml/parsererror.xml"; // NOSONAR

/**
 * @typedef {{parseFromString: (text: string, type: string) => Document}} DomParserLike
 */

/**
 * The first `parsererror` element of a document parsed by a DOMParser, if
 * any. Browsers and jsdom report malformed XML this way instead of throwing
 * (xmldom throws, see {@link parseXml}).
 *
 * @param {Node|null|undefined} doc - A parsed document (or element)
 * @returns {Element|null} The error element, or null when parsing succeeded
 *
 * @example
 * findParseError(new DOMParser().parseFromString("<a>", "application/xml"));
 * // <parsererror>…</parsererror>
 */
export function findParseError(doc) {
  if (!doc?.getElementsByTagName) return null;
  const plain = doc.getElementsByTagName("parsererror");
  if (plain.length > 0) return plain[0];
  const gecko = doc.getElementsByTagNameNS?.(
    GECKO_PARSER_ERROR_NS,
    "parsererror",
  );
  return gecko?.length > 0 ? gecko[0] : null;
}

/**
 * Pick the DOMParser to use.
 *
 * @param {DomParserLike|null|undefined} configured - The engine's `domParser` option
 * @param {Document|null|undefined} referenceDoc - A document whose window may
 *   provide a DOMParser (usually the stylesheet)
 * @returns {DomParserLike|null} A parser, or null when none is available
 */
export function resolveDomParser(configured, referenceDoc) {
  if (configured) return configured;
  const Parser =
    globalThis.DOMParser ?? referenceDoc?.defaultView?.DOMParser ?? null;
  return Parser ? new Parser() : null;
}

/**
 * Parse an XML string into a document.
 *
 * @param {string} xml - The markup
 * @param {DomParserLike|null} parser - The parser (see {@link resolveDomParser})
 * @returns {Document} The parsed document
 * @throws {Error} When no parser is available or the markup is not well formed
 *
 * @example
 * parseXml("<a/>", new DOMParser()).documentElement.nodeName; // "a"
 */
export function parseXml(xml, parser) {
  if (!parser) {
    throw new Error(
      "XML parsing not available in this environment: pass a domParser option or install a global DOMParser",
    );
  }
  let doc;
  try {
    doc = parser.parseFromString(xml, "application/xml");
  } catch (thrown) {
    // xmldom's own DOMParser throws a ParseError instead
    throw new Error(`XML parse error: ${thrown.message}`, {
      cause: thrown,
    });
  }
  const error = findParseError(doc);
  if (error) throw new Error(`XML parse error: ${error.textContent}`);
  return doc;
}
