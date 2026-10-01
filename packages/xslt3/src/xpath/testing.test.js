// Helpers shared by the tests of the XPath evaluator and the functions:
// parse a document, evaluate an expression and show its result as
// strings, or get the code of the error it raises. (A .test.js file, so
// it is neither published nor counted in coverage.)

import { DOMParser } from "@xmldom/xmldom";
import { isArray, isAtomic, isMap, isNode } from "../xdm/atomic.js";
import { canonicalString } from "../xdm/lexical.js";
import { evaluateXPath } from "./index.js";

/**
 * Parses an XML document with @xmldom/xmldom.
 * @param {string} text
 * @returns {Document}
 */
export const parse = (text) =>
  new DOMParser().parseFromString(text, "text/xml");

/**
 * A readable form of an item: atomic values in canonical form, nodes as
 * `<name>`, `@name`, `#text`... maps and arrays as their kind and size.
 * @param {*} item
 * @returns {string}
 */
export function show(item) {
  if (isAtomic(item)) return canonicalString(item);
  if (isNode(item)) {
    if (item.nodeType === 1) return `<${item.nodeName}>`;
    if (item.nodeType === 2) return `@${item.nodeName}`;
    if (item.nodeType === 13) return `ns:${item.localName}`;
    return item.nodeName;
  }
  if (isMap(item)) return `map(${item.size})`;
  if (isArray(item)) return `array(${item.size})`;
  return `function#${item.arity}`;
}

/**
 * Evaluates an expression and shows the items of its result.
 * @param {string} expr
 * @param {*} [contextItem]
 * @param {object} [options]
 * @returns {string[]}
 */
export const xp = (expr, contextItem, options) =>
  evaluateXPath(expr, contextItem, options).map(show);

/**
 * Evaluates an expression and joins the shown items with spaces.
 * @param {string} expr
 * @param {*} [contextItem]
 * @param {object} [options]
 * @returns {string}
 */
export const xs = (expr, contextItem, options) =>
  xp(expr, contextItem, options).join(" ");

/**
 * The code of the error an expression raises.
 * @param {string} expr
 * @param {*} [contextItem]
 * @param {object} [options]
 * @returns {string|null} the error code, null when there is no error
 */
export function code(expr, contextItem, options) {
  try {
    evaluateXPath(expr, contextItem, options);
    return null;
  } catch (error) {
    return error.code ?? error.message;
  }
}
