/**
 * The DOM tools of the test mode, on jsdom: one window for the engine and
 * the parser and serializer the comparison uses. jsdom is passed in (it is
 * an optional peer dependency, loaded by ./engines/load.js).
 *
 * @module xslt-migrate-check/compat/dom
 */

import { WRAPPER } from "./nodes.js";

const DOCTYPE = /^<!DOCTYPE[^>[]*>/i;

/**
 * Create the DOM tools.
 *
 * @param {Function} JSDOM - jsdom's JSDOM class
 * @returns {{window: object, parse: Function, serialize: Function}} A
 *   jsdom window, parse(text, method) and serialize(node)
 */
export function createDomTools(JSDOM) {
  const { window } = new JSDOM("");
  const parser = new window.DOMParser();
  const serializer = new window.XMLSerializer();
  return {
    window,
    /**
     * Parse a normalized result. XML results are wrapped in one element,
     * since a result may be a fragment.
     *
     * @param {string} text - The result
     * @param {"xml"|"html"} method - Output method
     * @returns {Document|null} The document, null when not well-formed
     */
    parse(text, method) {
      if (method === "html") return parser.parseFromString(text, "text/html");
      const body = text.replace(DOCTYPE, "");
      const doc = parser.parseFromString(
        `<${WRAPPER}>${body}</${WRAPPER}>`,
        "application/xml",
      );
      return doc.getElementsByTagName("parsererror").length > 0 ? null : doc;
    },
    /**
     * Serialize a node: outerHTML for HTML elements, XML otherwise.
     *
     * @param {Node} node - The node
     * @returns {string} Its markup
     */
    serialize(node) {
      const html = node.ownerDocument.contentType === "text/html";
      return html ? node.outerHTML : serializer.serializeToString(node);
    },
  };
}
