/**
 * Output Settings Resolution
 *
 * Normalizes the `xsl:output` settings collected by the XSLT engine into the
 * shape the serializers consume (XSLT 1.0 section 16).
 */

import { NODE_TYPE } from "./constants.js";

/**
 * Test whether an `xsl:output` yes/no attribute is enabled.
 *
 * @param {string|boolean|undefined} value - Raw attribute value
 * @returns {boolean} True when the value means "yes"
 */
function isYes(value) {
  return value === true || String(value).toLowerCase() === "yes";
}

/**
 * Convert a `cdata-section-elements` value into a lookup set.
 *
 * @param {string|string[]|undefined} value - Whitespace separated names or array
 * @returns {Set<string>} Element names requiring CDATA sections
 */
function toNameSet(value) {
  if (Array.isArray(value)) {
    return new Set(value);
  }
  if (typeof value === "string") {
    return new Set(value.split(/\s+/).filter(Boolean));
  }
  return new Set();
}

/**
 * Find the first element node of a result tree.
 *
 * @param {Node|null} node - Document, fragment or element
 * @returns {Element|null} The result document element, when there is one
 */
export function findRootElement(node) {
  if (!node) {
    return null;
  }
  if (node.nodeType === NODE_TYPE.ELEMENT) {
    return node;
  }
  for (const child of node.childNodes || []) {
    if (child.nodeType === NODE_TYPE.ELEMENT) {
      return child;
    }
  }
  return null;
}

/**
 * Derive the default output method from the result tree.
 *
 * XSLT 1.0 section 16 defaults to `html` when the document element is `html`
 * in no namespace, and to `xml` otherwise.
 *
 * @param {Node|null} node - Result tree root
 * @returns {string} Either "html" or "xml"
 */
export function detectOutputMethod(node) {
  const root = findRootElement(node);
  const isHtmlRoot =
    root && !root.namespaceURI && root.localName.toLowerCase() === "html";
  return isHtmlRoot ? "html" : "xml";
}

/**
 * Normalize an `xsl:output` settings object.
 *
 * An absent, empty or "auto" method triggers the XSLT 1.0 default method
 * detection based on the result tree.
 *
 * @param {object|null} outputSettings - Raw settings from the XSLT engine
 * @param {Node|null} node - Result tree used for default method detection
 * @returns {object} Normalized settings consumed by the serializers
 */
export function resolveOutputSettings(outputSettings, node) {
  const raw = outputSettings || {};
  const declared = typeof raw.method === "string" ? raw.method.trim() : "";
  const method =
    declared && declared !== "auto"
      ? declared.toLowerCase()
      : detectOutputMethod(node);

  return {
    method,
    version: raw.version || "1.0",
    encoding: raw.encoding || "UTF-8",
    standalone: raw.standalone || null,
    indent: isYes(raw.indent),
    omitXmlDeclaration: isYes(raw.omitXmlDeclaration),
    doctypePublic: raw.doctypePublic || null,
    doctypeSystem: raw.doctypeSystem || null,
    mediaType: raw.mediaType || null,
    cdataSectionElements: toNameSet(raw.cdataSectionElements),
  };
}
