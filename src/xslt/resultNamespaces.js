/**
 * Namespaces of result tree elements and attributes.
 *
 * - `xsl:element` and `xsl:attribute` resolve the prefix of their computed
 *   name against the namespaces in scope on the instruction, and an
 *   unprefixed `xsl:element` name takes the default namespace (XSLT 1.0
 *   sections 7.1.2 and 7.1.3); a `namespace` attribute wins over both.
 * - An attribute in a namespace needs a prefix, so one is generated (`ns1`,
 *   `ns2`, ...) when the name has none or its prefix is already bound to
 *   another namespace on the element.
 * - Literal result elements copy the namespace nodes in scope in the
 *   stylesheet (section 7.1.1) as `xmlns` attributes; declarations the parent
 *   result element already carries are not repeated.
 *
 * @module xslt/resultNamespaces
 */

"use strict";

import {
  XMLNS_NAMESPACE,
  resolvePrefix,
  resultNamespaceNodes,
} from "./stylesheetNamespaces.js";

/** Stylesheet scope each literal result element was created in. */
const createdInScope = new WeakMap();

/**
 * Split a QName into prefix and local part.
 *
 * @param {string} qname - e.g. `xl:href` or `p`
 * @returns {{prefix: string, localName: string}} The parts, prefix "" when absent
 */
export function splitQName(qname) {
  const colon = qname.indexOf(":");
  return colon < 0
    ? { prefix: "", localName: qname }
    : { prefix: qname.slice(0, colon), localName: qname.slice(colon + 1) };
}

/**
 * Compute the expanded name of an element created by `xsl:element`.
 *
 * @param {string} qname - The evaluated `name` attribute
 * @param {string|null} namespace - The evaluated `namespace` attribute, null when absent
 * @param {Object<string, string>} scope - Namespaces in scope on the instruction
 * @returns {{namespaceUri: (string|null), qname: string}} The element name
 *
 * @example
 * elementName("p", null, { "": "http://www.w3.org/1999/xhtml" });
 * // { namespaceUri: "http://www.w3.org/1999/xhtml", qname: "p" }
 */
export function elementName(qname, namespace, scope) {
  if (namespace !== null) return { namespaceUri: namespace || null, qname };
  const { prefix } = splitQName(qname);
  return { namespaceUri: resolvePrefix(scope, prefix), qname };
}

/**
 * Compute the expanded name of an attribute created by `xsl:attribute`.
 * Unprefixed attribute names are in no namespace unless `namespace` says so.
 *
 * @param {string} qname - The evaluated `name` attribute
 * @param {string|null} namespace - The evaluated `namespace` attribute, null when absent
 * @param {Object<string, string>} scope - Namespaces in scope on the instruction
 * @returns {{namespaceUri: (string|null), qname: string}} The attribute name
 */
export function attributeName(qname, namespace, scope) {
  const { prefix, localName } = splitQName(qname);
  if (namespace !== null) {
    return namespace
      ? { namespaceUri: namespace, qname }
      : { namespaceUri: null, qname: localName };
  }
  return { namespaceUri: prefix ? resolvePrefix(scope, prefix) : null, qname };
}

/**
 * Whether a prefix may be used on an element for a namespace: it must not be
 * bound to another namespace by the element name or by another attribute.
 *
 * @param {Element} element - The result element
 * @param {string} prefix - A candidate prefix
 * @param {string} uri - The namespace the prefix should denote
 * @returns {boolean} True when the prefix is free or already bound to `uri`
 */
function prefixAvailable(element, prefix, uri) {
  if (element.prefix === prefix && element.namespaceURI !== uri) return false;
  for (const attribute of element.attributes) {
    if (attribute.prefix === prefix && attribute.namespaceURI !== uri) {
      return false;
    }
    if (
      attribute.namespaceURI === XMLNS_NAMESPACE &&
      attribute.localName === prefix &&
      attribute.value !== uri
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Pick the prefix of a namespaced attribute on an element.
 *
 * @param {Element} element - The result element
 * @param {string} prefix - The prefix of the requested name, "" when none
 * @param {string} uri - The attribute namespace
 * @returns {string} A prefix bound to nothing else on the element
 */
function attributePrefix(element, prefix, uri) {
  if (prefix && prefix !== "xmlns" && prefixAvailable(element, prefix, uri)) {
    return prefix;
  }
  let index = 1;
  while (!prefixAvailable(element, `ns${index}`, uri)) index++;
  return `ns${index}`;
}

/**
 * Add (or replace) an attribute of a result element.
 *
 * @param {Element} element - The result element
 * @param {{namespaceUri: (string|null), qname: string}} name - Expanded name
 * @param {string} value - The attribute value
 * @returns {void}
 *
 * @example
 * setResultAttribute(el, { namespaceUri: "urn:x", qname: "a" }, "1"); // ns1:a="1"
 */
export function setResultAttribute(element, name, value) {
  const { prefix, localName } = splitQName(name.qname);
  if (!name.namespaceUri) {
    if (localName === "xmlns") return;
    element.setAttribute(localName, value);
    return;
  }
  if (name.qname === "xmlns" || prefix === "xmlns") return;

  const existing = element.getAttributeNodeNS(name.namespaceUri, localName);
  if (existing) {
    existing.value = value;
    return;
  }
  const chosen = attributePrefix(element, prefix, name.namespaceUri);
  element.setAttributeNS(name.namespaceUri, `${chosen}:${localName}`, value);
}

/**
 * Copy the namespace nodes of a literal result element onto its result
 * element, skipping the declarations already in effect on the parent.
 *
 * @param {Element} element - The new result element
 * @param {Element} stylesheetNode - The literal result element
 * @param {Node} parent - The result node receiving `element`
 * @param {(uri: string) => boolean} isAliased - Whether a URI is the
 *   stylesheet side of an `xsl:namespace-alias` (such namespaces are replaced,
 *   never copied)
 * @returns {void}
 */
export function copyLiteralNamespaces(
  element,
  stylesheetNode,
  parent,
  isAliased,
) {
  const nodes = resultNamespaceNodes(stylesheetNode);
  if (nodes.length === 0) return;
  createdInScope.set(element, nodes);
  if (createdInScope.get(parent) === nodes) return;

  const parentElement = parent.nodeType === 1 ? parent : null;
  for (const [prefix, uri] of nodes) {
    if (isAliased(uri)) continue;
    if (parentElement?.lookupNamespaceURI(prefix || null) === uri) continue;
    if ((element.prefix ?? "") === prefix && element.namespaceURI !== uri) {
      continue;
    }
    element.setAttributeNS(
      XMLNS_NAMESPACE,
      prefix ? `xmlns:${prefix}` : "xmlns",
      uri,
    );
  }
}

/**
 * Copy the namespace declarations of a source element (its own `xmlns`
 * attributes) onto a copy, as `xsl:copy` and `xsl:copy-of` do.
 *
 * @param {Element} source - The copied element
 * @param {Element} copy - The result element
 * @returns {void}
 */
export function copyNamespaceDeclarations(source, copy) {
  for (const attribute of source.attributes) {
    if (attribute.namespaceURI !== XMLNS_NAMESPACE) continue;
    const prefix = attribute.prefix ? attribute.localName : "";
    if (
      (copy.prefix ?? "") === prefix &&
      copy.namespaceURI !== attribute.value
    ) {
      continue;
    }
    copy.setAttributeNS(XMLNS_NAMESPACE, attribute.name, attribute.value);
  }
}
