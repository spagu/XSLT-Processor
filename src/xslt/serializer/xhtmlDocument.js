/**
 * XHTML 1.0 documents in xml output, as libxml2 (and so Chrome's
 * XSLTProcessor) writes them.
 *
 * When the xml output declares one of the XHTML 1.0 document types
 * (`doctype-public` or `doctype-system` of XHTML 1.0 Strict, Transitional
 * or Frameset), libxml2 switches to its XHTML serializer, which follows the
 * compatibility guidelines of XHTML 1.0 appendix C:
 * - an `html` element in no namespace without namespace declarations gets
 *   `xmlns="http://www.w3.org/1999/xhtml"` (A.3.1.1);
 * - a `head` child of the `html` document element without a Content-Type
 *   `meta` gets `<meta http-equiv="Content-Type" content="text/html;
 *   charset=..." />` as its first child (C.9);
 * - elements in no namespace follow the empty element rules of XHTML
 *   elements (C.2, C.3).
 *
 * @module xslt/serializer/xhtmlDocument
 */

import { NODE_TYPE, XHTML_NAMESPACE } from "./constants.js";

/** Public identifiers of the XHTML 1.0 document types. */
const XHTML1_PUBLIC_IDS = new Set([
  "-//W3C//DTD XHTML 1.0 Strict//EN",
  "-//W3C//DTD XHTML 1.0 Transitional//EN",
  "-//W3C//DTD XHTML 1.0 Frameset//EN",
]);

/** System identifiers of the XHTML 1.0 document types. */
const XHTML1_SYSTEM_IDS = new Set([
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd",
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd",
  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-frameset.dtd",
]);

/**
 * Whether the output settings declare an XHTML 1.0 document type.
 *
 * @param {{doctypePublic?: string|null, doctypeSystem?: string|null}} settings -
 *   Normalized output settings
 * @returns {boolean} True for the XHTML 1.0 public or system identifiers
 *
 * @example
 * isXhtml1Doctype({ doctypePublic: "-//W3C//DTD XHTML 1.0 Strict//EN" }); // true
 */
export function isXhtml1Doctype(settings) {
  return (
    XHTML1_PUBLIC_IDS.has(settings.doctypePublic) ||
    XHTML1_SYSTEM_IDS.has(settings.doctypeSystem)
  );
}

/**
 * The namespace declaration libxml2 adds to an `html` element in no
 * namespace that declares no namespace itself.
 *
 * @param {Element} element - Element being written
 * @param {Array<object>} declarations - Declarations written on it
 * @returns {string} ` xmlns="http://www.w3.org/1999/xhtml"`, or ""
 */
export function xhtmlRootNamespace(element, declarations) {
  const needed =
    element.localName === "html" &&
    !element.namespaceURI &&
    declarations.length === 0;
  return needed ? ` xmlns="${XHTML_NAMESPACE}"` : "";
}

/**
 * Whether a `head` element has a `meta` child with
 * `http-equiv="Content-Type"` (compared case-insensitively).
 *
 * @param {Element} head - The head element
 * @returns {boolean} True when libxml2 adds no meta element
 */
function hasContentTypeMeta(head) {
  for (const child of head.childNodes) {
    if (child.nodeType !== NODE_TYPE.ELEMENT || child.localName !== "meta") {
      continue;
    }
    const value = child.getAttribute("http-equiv");
    if (value?.toLowerCase() === "content-type") return true;
  }
  return false;
}

/**
 * The Content-Type `meta` element libxml2 writes as the first child of the
 * `head` child of an `html` document element.
 *
 * @param {Element} element - Element being written
 * @param {string} encoding - The output encoding, as declared
 * @returns {string} The meta element markup, or ""
 */
export function xhtmlHeadMeta(element, encoding) {
  const parent = element.parentNode;
  const isHead =
    element.localName === "head" &&
    parent?.localName === "html" &&
    parent.parentNode?.nodeType !== NODE_TYPE.ELEMENT;
  if (!isHead || hasContentTypeMeta(element)) return "";
  return `<meta http-equiv="Content-Type" content="text/html; charset=${encoding}" />`;
}
