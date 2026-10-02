/**
 * `<?xml-stylesheet type="text/xsl"?>` without native XSLT.
 *
 * A browser that still has XSLT applies the processing instruction while it
 * parses the XML document, so the source document is never shown and its
 * scripts never run. A browser without XSLT (Chrome 158 and later) shows the
 * raw XML instead, and does run an XHTML `<script>` element found in it. That
 * is the hook: an XML document that adds one line after the processing
 * instruction,
 *
 *   <script xmlns="http://www.w3.org/1999/xhtml" src=".../xslt-processor.browser.min.js"></script>
 *
 * loads this library, which finds the processing instruction, fetches the
 * stylesheet, transforms the document with this XSLTProcessor and replaces
 * the document element with the result, so the page renders as it did.
 *
 * @module browser/xmlStylesheet
 */

import { XSLTProcessor } from "../XSLTProcessor.js";
import { findParseError } from "../xslt/domParsing.js";

const XHTML = "http://www.w3.org/1999/xhtml";

/** Media types of an xml-stylesheet processing instruction naming XSLT. */
const XSLT_TYPES = new Set([
  "text/xsl",
  "text/xslt",
  "application/xslt+xml",
  "application/xml",
  "text/xml",
]);

/**
 * The first `xml-stylesheet` processing instruction of a document that names
 * an XSLT stylesheet (an `alternate="yes"` one is skipped, as browsers do).
 *
 * @param {Document} doc - The document
 * @returns {{href: string, type: string}|null} Its href and type, or null
 *
 * @example
 * findXmlStylesheet(document); // { href: "style.xsl", type: "text/xsl" }
 */
export function findXmlStylesheet(doc) {
  for (const node of doc.childNodes) {
    if (node.nodeType !== 7 || node.target !== "xml-stylesheet") continue;
    const pseudo = parsePseudoAttributes(node.data);
    const type = (pseudo.type || "").toLowerCase();
    if (!pseudo.href || !XSLT_TYPES.has(type)) continue;
    if ((pseudo.alternate || "").toLowerCase() === "yes") continue;
    return { href: pseudo.href, type };
  }
  return null;
}

/**
 * The pseudo-attributes of a processing instruction (`a="1" b='2'`).
 *
 * @param {string} data - The instruction's data
 * @returns {Record<string, string>} Name to value
 */
function parsePseudoAttributes(data) {
  const result = {};
  for (const match of data.matchAll(
    /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    result[match[1]] = match[2] ?? match[3];
  }
  return result;
}

/**
 * Whether a document is XML shown unstyled with an XSLT processing
 * instruction the browser did not apply: not an HTML document, and its
 * document element is not already an XHTML `html` (the result of a
 * transformation, or an XHTML page that happens to carry the instruction).
 *
 * @param {Document} doc - The document
 * @returns {boolean} True when applyXmlStylesheet should run
 */
export function needsXmlStylesheet(doc) {
  if (!doc || doc.contentType === "text/html") return false;
  const root = doc.documentElement;
  if (root && root.namespaceURI === XHTML && root.localName === "html") {
    return false;
  }
  return findXmlStylesheet(doc) !== null;
}

/**
 * Apply the document's `xml-stylesheet` processing instruction with this
 * library: fetch the stylesheet (and what it imports) relative to the
 * document, transform the document (without the XHTML script elements that
 * loaded the library), and replace the document element with the result.
 * Script elements of the result are re-created so that they run.
 *
 * @param {Document} [doc=document] - The XML document
 * @param {object} [options] - Options, mostly for tests
 * @param {typeof fetch} [options.fetch] - fetch to use (default: the global one)
 * @param {typeof XSLTProcessor} [options.Processor] - Processor class
 * @returns {Promise<boolean>} True when a stylesheet was applied, false when
 *   the document needs none (see needsXmlStylesheet)
 * @throws {Error} When the stylesheet cannot be fetched or is not well-formed
 *
 * @example
 * await applyXmlStylesheet(); // the page now shows the transformed result
 */
export async function applyXmlStylesheet(
  doc = globalThis.document,
  options = {},
) {
  if (!needsXmlStylesheet(doc)) return false;
  const { href } = findXmlStylesheet(doc);
  const url = new globalThis.URL(href, doc.URL).href;
  const doFetch = options.fetch ?? globalThis.fetch;
  const response = await doFetch(url);
  if (!response.ok) {
    throw new Error(`xml-stylesheet: ${url} answered ${response.status}`);
  }
  const stylesheet = parseStylesheet(await response.text(), url, doc);
  const Processor = options.Processor ?? XSLTProcessor;
  const processor = new Processor();
  await processor.importStylesheetAsync(stylesheet, url);
  const result = processor.transformToDocument(sourceWithoutScripts(doc));
  render(doc, result);
  return true;
}

/**
 * Parse the stylesheet with the DOMParser of the document's window (the
 * global one in Node.js hosts).
 *
 * @param {string} text - Stylesheet markup
 * @param {string} url - Its URL, for the error message
 * @param {Document} doc - The document being styled
 * @returns {Document} The stylesheet document
 * @throws {Error} When the markup is not well-formed XML
 */
function parseStylesheet(text, url, doc) {
  const Parser = doc.defaultView?.DOMParser ?? globalThis.DOMParser;
  const stylesheet = new Parser().parseFromString(text, "application/xml");
  const error = findParseError(stylesheet);
  if (error) {
    throw new Error(
      `xml-stylesheet: ${url} is not well-formed XML: ${error.textContent.trim().split("\n")[0]}`,
    );
  }
  return stylesheet;
}

/**
 * A copy of the document without its XHTML script elements (the one that
 * loaded this library, and any other), so the stylesheet does not see them.
 *
 * @param {Document} doc - The source document
 * @returns {Document} The copy
 */
function sourceWithoutScripts(doc) {
  const copy = doc.cloneNode(true);
  for (const script of Array.from(
    copy.getElementsByTagNameNS(XHTML, "script"),
  )) {
    script.parentNode.removeChild(script);
  }
  return copy;
}

/**
 * Replace the document element with the result's, adopted into the
 * document, with its script elements re-created so the browser runs them
 * (scripts moved from another document count as already started).
 *
 * @param {Document} doc - The document shown by the browser
 * @param {Document} result - The transformation result
 */
function render(doc, result) {
  const root = doc.adoptNode(result.documentElement);
  for (const script of Array.from(
    root.getElementsByTagNameNS(XHTML, "script"),
  )) {
    const fresh = doc.createElementNS(XHTML, "script");
    for (const attribute of script.attributes) {
      fresh.setAttribute(attribute.name, attribute.value);
    }
    fresh.textContent = script.textContent;
    script.parentNode.replaceChild(fresh, script);
  }
  doc.replaceChild(root, doc.documentElement);
}

/**
 * Apply the processing instruction of the current document once it is
 * parsed, when the browser did not: called by the browser bundle next to
 * installGlobal(). Errors are reported on the console; the raw XML stays.
 *
 * @param {Document} [doc=document] - The document
 * @returns {void}
 *
 * @example
 * autoApplyXmlStylesheet(); // in the bundle footer
 */
export function autoApplyXmlStylesheet(doc = globalThis.document) {
  if (!needsXmlStylesheet(doc)) return;
  const run = () => {
    applyXmlStylesheet(doc).catch((error) => {
      console.error("xml-stylesheet: could not apply the stylesheet:", error);
    });
  };
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
