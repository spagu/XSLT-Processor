/**
 * XSLT element vocabulary.
 *
 * Single source of truth for the XSLT namespace URI and for the element names
 * the engine can instantiate. `element-available()` reports against this table,
 * so it stays in step with what {@link XsltEngine#processXsltElement} handles.
 */

"use strict";

/** The XSLT 1.0 namespace URI. */
export const XSLT_NAMESPACE = "http://www.w3.org/1999/XSL/Transform";

/**
 * Element names the engine dispatches, i.e. every element that
 * `element-available()` must report as supported.
 */
export const XSLT_ELEMENTS = Object.freeze([
  "apply-imports",
  "apply-templates",
  "attribute",
  "call-template",
  "choose",
  "comment",
  "copy",
  "copy-of",
  "element",
  "fallback",
  "for-each",
  "if",
  "message",
  "number",
  "otherwise",
  "param",
  "processing-instruction",
  "sort",
  "text",
  "value-of",
  "variable",
  "when",
  "with-param",
]);

const ELEMENT_SET = new Set(XSLT_ELEMENTS);

/**
 * Check whether an XSLT element local name is supported by the engine.
 *
 * @param {string} localName - Element local name, e.g. `for-each`
 * @returns {boolean} True when the engine instantiates the element
 *
 * @example
 * isXsltElementAvailable('for-each'); // true
 */
export function isXsltElementAvailable(localName) {
  return ELEMENT_SET.has(localName);
}
