/**
 * The serialization parameters of Serialization 3.1 section 3: their
 * names (hyphenated as in the specs, camelCase in the JavaScript API) and
 * the kind of value each one takes.
 *
 * @module @tradik/xslt3/serialize/params/names
 */

/** Namespace of the serialization parameter elements (prefix output). */
export const OUTPUT_NAMESPACE =
  "http://www.w3.org/2010/xslt-xquery-serialization";

/**
 * Kind of value of each parameter, by hyphenated name:
 * - "boolean": yes/no (true/false, 1/0)
 * - "string": any string
 * - "qnames": a list of element names (EQNames)
 * - "method": xml, xhtml, html, text, json, adaptive or an extension QName
 * - "decimal": a decimal number (html-version)
 * - "standalone": yes, no or omit
 * - "characterMap": character to replacement string
 */
export const PARAMETER_KINDS = Object.freeze({
  "allow-duplicate-names": "boolean",
  "byte-order-mark": "boolean",
  "cdata-section-elements": "qnames",
  "doctype-public": "string",
  "doctype-system": "string",
  encoding: "string",
  "escape-uri-attributes": "boolean",
  "html-version": "decimal",
  "include-content-type": "boolean",
  indent: "boolean",
  "item-separator": "string",
  "json-node-output-method": "method",
  "media-type": "string",
  method: "method",
  "normalization-form": "string",
  "omit-xml-declaration": "boolean",
  standalone: "standalone",
  "suppress-indentation": "qnames",
  "undeclare-prefixes": "boolean",
  "use-character-maps": "characterMap",
  version: "string",
});

/**
 * @param {string} name - Hyphenated name, e.g. "omit-xml-declaration"
 * @returns {string} the camelCase name, e.g. "omitXmlDeclaration"
 */
export const toCamelCase = (name) =>
  name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

/**
 * @param {string} name - camelCase name, e.g. "omitXmlDeclaration"
 * @returns {string} the hyphenated name, e.g. "omit-xml-declaration"
 */
export const toHyphenated = (name) =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** Output methods of Serialization 3.1. */
export const METHODS = Object.freeze([
  "xml",
  "xhtml",
  "html",
  "text",
  "json",
  "adaptive",
]);
