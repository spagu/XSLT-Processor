/**
 * Checks of the XML representation of JSON read by fn:xml-to-json (F&O
 * 3.1 section 17.5.4): boolean attributes, allowed attributes, the text
 * of simple elements and the members of maps and arrays (FOJS0006).
 *
 * @module @tradik/xslt3/functions/json/xmlRepresentation
 */

import { XPathError } from "../../errors.js";
import { normalizeWhitespace, parseBoolean } from "../../xdm/strings.js";
import { attributesOf } from "../../xpath/eval/domNodes.js";
import { FN_NAMESPACE } from "../support.js";

/**
 * @param {string} message
 * @returns {never}
 * @throws {XPathError} FOJS0006
 */
export const invalid = (message) => {
  throw new XPathError(
    "FOJS0006",
    `Invalid XML representation of JSON: ${message}`,
  );
};

const ATTRIBUTES = new Set(["key", "escaped", "escaped-key"]);

/**
 * A boolean attribute of the representation.
 * @param {Element} element
 * @param {string} name
 * @returns {boolean}
 */
export function flag(element, name) {
  if (!element.hasAttribute(name)) return false;
  const value = parseBoolean(
    normalizeWhitespace(element.getAttribute(name), "collapse"),
  );
  if (value === null) invalid(`${name}="${element.getAttribute(name)}"`);
  return value;
}

/**
 * The children of an element that matter: elements and text, without
 * comments and processing instructions.
 * @param {Element} element
 * @returns {Node[]}
 */
const contentOf = (element) =>
  [...element.childNodes].filter((n) => n.nodeType !== 7 && n.nodeType !== 8);

/** @param {Node} node @returns {boolean} whether it is a text node */
const isText = (node) => node.nodeType === 3 || node.nodeType === 4;

/**
 * Text content of a simple element (string, number, boolean, null).
 * @param {Element} element
 * @returns {string}
 */
export function textOf(element) {
  let text = "";
  for (const node of contentOf(element)) {
    if (node.nodeType === 1) invalid(`element in <${element.localName}>`);
    if (isText(node)) text += node.nodeValue;
  }
  return text;
}

/**
 * The element children of a map or array.
 * @param {Element} element
 * @returns {Element[]}
 */
export function members(element) {
  const result = [];
  for (const node of contentOf(element)) {
    if (node.nodeType === 1) result.push(node);
    else if (isText(node) && /\S/.test(node.nodeValue)) {
      invalid(`text in <${element.localName}>`);
    }
  }
  return result;
}

/**
 * Checks the attributes of an element: key and escaped-key, escaped on
 * strings, and attributes in other namespaces than fn.
 * @param {Element} element
 * @throws {XPathError} FOJS0006 for another attribute
 */
export function checkAttributes(element) {
  for (const attribute of attributesOf(element)) {
    const uri = attribute.namespaceURI ?? "";
    const allowed =
      uri === ""
        ? ATTRIBUTES.has(attribute.localName) &&
          (attribute.localName !== "escaped" || element.localName === "string")
        : uri !== FN_NAMESPACE;
    if (!allowed) {
      invalid(`attribute ${attribute.name} on <${element.localName}>`);
    }
  }
}
