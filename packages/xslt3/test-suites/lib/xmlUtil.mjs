/**
 * Small DOM helpers for reading the test suite catalogs with @xmldom/xmldom.
 *
 * Catalog elements are matched by local name only: both suites use a single
 * default namespace per file, so the namespace adds nothing.
 *
 * @module test-suites/lib/xmlUtil
 */

import { TextDecoder } from "node:util";
import { DOMParser } from "@xmldom/xmldom";

const ELEMENT_NODE = 1;

/**
 * Decode the bytes of an XML file using its byte order mark or the
 * `encoding` of its XML declaration (UTF-8 when neither is present or the
 * label is unknown).
 *
 * @param {Uint8Array} bytes - File content
 * @returns {string} Decoded text without a byte order mark
 */
export function decodeXml(bytes) {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const label = /^<\?xml[^>]*\sencoding\s*=\s*["']([^"']+)["']/.exec(head);
  let decoder;
  try {
    decoder = new TextDecoder(label ? label[1] : "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(bytes);
}

/**
 * Parse XML text into a document, throwing on well-formedness errors and
 * ignoring warnings.
 *
 * @param {string} text - XML text
 * @param {string} [label] - Name used in error messages
 * @returns {Document} The parsed document
 * @throws {Error} When the text is not well-formed
 */
export function parseXml(text, label = "XML") {
  const parser = new DOMParser({
    onError(level, message) {
      if (level !== "warning") throw new Error(`${label}: ${message}`);
    },
  });
  return parser.parseFromString(text, "text/xml");
}

/**
 * Child elements of an element, optionally only those with a local name.
 *
 * @param {Element} element - Parent element
 * @param {string} [name] - Local name to keep
 * @returns {Element[]} Child elements in document order
 */
export function childElements(element, name) {
  const result = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== ELEMENT_NODE) continue;
    if (name === undefined || node.localName === name) result.push(node);
  }
  return result;
}

/**
 * First child element with a local name.
 *
 * @param {Element} element - Parent element
 * @param {string} name - Local name
 * @returns {Element|undefined} The child, if any
 */
export function firstChild(element, name) {
  return childElements(element, name)[0];
}

/**
 * Attribute value, or undefined when the attribute is absent.
 *
 * @param {Element} element - Element
 * @param {string} name - Attribute name
 * @returns {string|undefined} The value
 */
export function attr(element, name) {
  return element.hasAttribute(name) ? element.getAttribute(name) : undefined;
}

/**
 * Boolean attribute (`true`/`1`/`yes` are true), with a default.
 *
 * @param {Element} element - Element
 * @param {string} name - Attribute name
 * @param {boolean} [fallback] - Value when absent
 * @returns {boolean} The value
 */
export function boolAttr(element, name, fallback = false) {
  const value = attr(element, name);
  if (value === undefined) return fallback;
  return ["true", "1", "yes"].includes(value.trim());
}

/**
 * All attributes of an element as a plain object (catalog-only attributes
 * like `xml:space` included).
 *
 * @param {Element} element - Element
 * @returns {Record<string, string>} Attribute name to value
 */
export function attributes(element) {
  const result = {};
  for (let i = 0; i < element.attributes.length; i++) {
    const item = element.attributes.item(i);
    result[item.name] = item.value;
  }
  return result;
}
