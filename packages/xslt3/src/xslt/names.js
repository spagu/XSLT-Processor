/**
 * Names shared by the XSLT compiler and runtime: namespace URIs, the
 * errors of the XSLT specification, attribute access and the resolution
 * of the QNames written in stylesheet attributes.
 *
 * @module @tradik/xslt3/xslt/names
 */

import { XPathError } from "../errors.js";

/** The XSLT namespace. */
export const XSL_NS = "http://www.w3.org/1999/XSL/Transform";
/** Namespace of namespace declarations. */
export const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
/** The namespace bound to the xml prefix. */
export const XML_NS = "http://www.w3.org/XML/1998/namespace";

// combining marks (U+0300-036F) are in \p{M}
const NCNAME = /^[\p{L}_][\p{L}\p{N}\p{M}_.\-·‿⁀]*$/u;

/**
 * @param {string} text
 * @returns {boolean} whether the text is an NCName
 */
export const isNCName = (text) => NCNAME.test(text);

/**
 * @param {string} text
 * @returns {boolean} whether the text is a lexical QName
 */
export function isQName(text) {
  const colon = text.indexOf(":");
  if (colon < 0) return isNCName(text);
  return isNCName(text.slice(0, colon)) && isNCName(text.slice(colon + 1));
}

/**
 * An error of the XSLT specification.
 * @param {string} code - Error code, e.g. "XTSE0010"
 * @param {string} message
 * @returns {XPathError}
 */
export const xsltError = (code, message) => new XPathError(code, message);

/**
 * @param {Node} node
 * @param {string} [local] - Local name required
 * @returns {boolean} whether the node is an element of the XSLT namespace
 */
export const isXsl = (node, local) =>
  node.nodeType === 1 &&
  node.namespaceURI === XSL_NS &&
  (local === undefined || node.localName === local);

/** @type {WeakMap<Element, Map<string, string>>} shadow attribute values */
const shadows = new WeakMap();

/**
 * Records the values of the shadow attributes of an element (XSLT 3.0
 * section 3.13.2): they replace the attributes of the same name.
 * @param {Element} element
 * @param {Map<string, string>} values - By attribute name
 */
export function setShadowAttributes(element, values) {
  shadows.set(element, values);
}

/**
 * Value of an attribute without namespace (or of its shadow attribute).
 * @param {Element} element
 * @param {string} name
 * @returns {string|undefined} undefined when absent
 */
export function attr(element, name) {
  const shadow = shadows.get(element)?.get(name);
  if (shadow !== undefined) return shadow;
  const node = element.getAttributeNode(name);
  return node && !node.namespaceURI ? node.value : undefined;
}

/**
 * Value of an attribute in the XSLT namespace (standard attributes of
 * literal result elements, such as xsl:version).
 * @param {Element} element
 * @param {string} local
 * @returns {string|undefined}
 */
export function xslAttr(element, local) {
  return element.hasAttributeNS(XSL_NS, local)
    ? element.getAttributeNS(XSL_NS, local)
    : undefined;
}

/**
 * A standard attribute: unprefixed on XSLT elements, in the XSLT
 * namespace on other elements.
 * @param {Element} element
 * @param {string} local
 * @returns {string|undefined}
 */
export const standardAttr = (element, local) =>
  element.namespaceURI === XSL_NS
    ? attr(element, local)
    : xslAttr(element, local);

/**
 * @typedef {object} ExpandedName
 * @property {string} uri - Namespace URI, "" for none
 * @property {string} local - Local part
 * @property {string} prefix - Prefix as written, "" for none
 */

/**
 * Resolves a QName or EQName written in a stylesheet.
 * @param {string} text
 * @param {Map<string, string>} namespaces - In-scope namespaces
 * @param {object} [options]
 * @param {boolean} [options.useDefault] - Unprefixed names take the
 *   default namespace
 * @param {string} [options.code] - Error code of an undeclared prefix
 *   (default XTSE0280), and of an invalid name when `syntaxCode` is absent
 * @param {string} [options.syntaxCode] - Error code of an invalid name
 *   (default XTSE0020 with the default `code`)
 * @returns {ExpandedName}
 * @throws {XPathError} for an invalid name or undeclared prefix
 */
export function resolveQName(text, namespaces, options = {}) {
  const { useDefault = false, code = "XTSE0280" } = options;
  const syntaxCode =
    options.syntaxCode ?? (options.code === undefined ? "XTSE0020" : code);
  const name = text.trim();
  const eq = /^Q\{([^{}]*)\}(.*)$/s.exec(name);
  if (eq) {
    if (!isNCName(eq[2])) throw xsltError(syntaxCode, `Invalid name ${name}`);
    return { uri: eq[1], local: eq[2], prefix: "" };
  }
  if (!isQName(name)) throw xsltError(syntaxCode, `Invalid QName "${name}"`);
  const colon = name.indexOf(":");
  if (colon < 0) {
    const uri = useDefault ? (namespaces.get("") ?? "") : "";
    return { uri, local: name, prefix: "" };
  }
  const prefix = name.slice(0, colon);
  const uri = namespaces.get(prefix);
  if (uri === undefined || uri === "") {
    throw xsltError(code, `The prefix ${prefix} is not declared`);
  }
  return { uri, local: name.slice(colon + 1), prefix };
}

/** Namespaces in which stylesheets cannot declare names (XTSE0080). */
export const RESERVED_NAMESPACES = new Set([
  XSL_NS,
  "http://www.w3.org/2005/xpath-functions",
  "http://www.w3.org/2005/xpath-functions/math",
  "http://www.w3.org/2005/xpath-functions/map",
  "http://www.w3.org/2005/xpath-functions/array",
  "http://www.w3.org/2001/XMLSchema",
  "http://www.w3.org/2001/XMLSchema-instance",
  XML_NS,
]);

/**
 * Checks that a declared name is not in a reserved namespace.
 * @param {ExpandedName} name
 * @param {string} [allowed] - Clark name allowed anyway
 *   (`{XSL}initial-template` for templates)
 * @returns {ExpandedName} the name
 * @throws {XPathError} XTSE0080
 */
export function declaredName(name, allowed) {
  if (RESERVED_NAMESPACES.has(name.uri) && clarkOf(name) !== allowed) {
    throw xsltError("XTSE0080", `The namespace ${name.uri} is reserved`);
  }
  return name;
}

/**
 * @param {{uri: string, local: string}} name
 * @returns {string} Clark notation `{uri}local`
 */
export const clarkOf = (name) => `{${name.uri}}${name.local}`;

/**
 * Splits a whitespace-separated list.
 * @param {string|undefined} text
 * @returns {string[]}
 */
export const tokens = (text) => (text ?? "").split(/\s+/).filter(Boolean);
