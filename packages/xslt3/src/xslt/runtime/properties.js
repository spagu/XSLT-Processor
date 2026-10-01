/**
 * What the processor reports about itself: system-property() values
 * (XSLT 3.0 section 20.4.4) and the instructions element-available()
 * knows.
 *
 * @module @tradik/xslt3/xslt/runtime/properties
 */

/** System properties in the XSLT namespace. */
const PROPERTIES = {
  version: "3.0",
  vendor: "tradik",
  "vendor-url": "https://xslt-processor.tradik.com/",
  "product-name": "@tradik/xslt3",
  "product-version": "0.0.0",
  "is-schema-aware": "no",
  "supports-serialization": "yes",
  "supports-backwards-compatibility": "yes",
  "supports-namespace-axis": "yes",
  "supports-streaming": "no",
  "supports-dynamic-evaluation": "no",
  "supports-higher-order-functions": "yes",
  "xpath-version": "3.1",
  "xsd-version": "1.1",
};

/**
 * The value of a system property in the XSLT namespace.
 * @param {string} local - Local name
 * @returns {string} "" for an unknown property
 */
export const systemProperty = (local) => PROPERTIES[local] ?? "";

/** @returns {string[]} the local names of the system properties */
export const systemPropertyNames = () => Object.keys(PROPERTIES);

/** Local names of the XSLT elements (instructions and declarations) implemented. */
export const availableInstructions = new Set([
  "attribute-set",
  "character-map",
  "decimal-format",
  "function",
  "import",
  "include",
  "key",
  "mode",
  "namespace-alias",
  "output",
  "param",
  "preserve-space",
  "strip-space",
  "stylesheet",
  "template",
  "transform",
  "analyze-string",
  "apply-imports",
  "apply-templates",
  "attribute",
  "call-template",
  "choose",
  "comment",
  "copy",
  "copy-of",
  "document",
  "element",
  "fallback",
  "for-each",
  "for-each-group",
  "if",
  "message",
  "namespace",
  "next-match",
  "number",
  "perform-sort",
  "processing-instruction",
  "result-document",
  "sequence",
  "text",
  "value-of",
  "try",
  "map",
  "map-entry",
  "variable",
]);
