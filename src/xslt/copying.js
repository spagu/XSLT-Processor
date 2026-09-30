/**
 * Copying source nodes to the result tree: `xsl:copy-of` (XSLT 1.0 section
 * 11.3) and the node kinds of `xsl:copy` (section 7.5).
 *
 * Copies follow the XPath data model rather than the raw DOM: a run of
 * adjacent Text/CDATA nodes is one text node (its first DOM node stands for
 * the run), copying a root node copies its children, and copying an attribute
 * or a namespace node adds it to the result element being built. Names keep their namespace and
 * elements keep their namespace declarations.
 *
 * @module xslt/copying
 */

"use strict";

import { childAxis } from "../xpath/axes.js";
import { NAMESPACE_NODE, inScopeBindings } from "../xpath/namespaceNodes.js";
import { copyNamespaceDeclarations } from "./resultNamespaces.js";
import { XMLNS_NAMESPACE } from "./stylesheetNamespaces.js";

/**
 * Copy an attribute node onto a result element. A namespace declaration or a
 * target that is not an element is ignored; so is an attribute added after
 * the element got children (see {@link canAddAttribute}).
 *
 * @param {Attr} attribute - The source attribute
 * @param {Node} target - The result node receiving it
 * @param {(element: Node) => boolean} canAddAttribute - Guard for late attributes
 * @returns {void}
 */
export function copyAttribute(attribute, target, canAddAttribute) {
  if (attribute.namespaceURI === XMLNS_NAMESPACE) return;
  if (!canAddAttribute(target)) return;
  if (attribute.namespaceURI) {
    target.setAttributeNS(
      attribute.namespaceURI,
      attribute.name,
      attribute.value,
    );
  } else {
    target.setAttribute(attribute.name, attribute.value);
  }
}

/**
 * Copy a namespace node onto a result element as a namespace declaration
 * (XSLT 1.0 sections 7.5 and 11.3). As in libxslt, nothing is declared for
 * the implicit `xml` binding, for a prefix the element's own name binds to
 * another namespace, for a prefix the element already declares differently,
 * or when the element already has children (see `canAddAttribute`).
 *
 * @param {import('../xpath/namespaceNodes.js').NamespaceNode} namespace - The namespace node
 * @param {Node} target - The result node receiving it
 * @param {(element: Node) => boolean} canAddNamespace - Guard for late nodes
 * @returns {void}
 *
 * @example
 * copyNamespaceNode(nsNode, resultElement, () => true); // xmlns:a="urn:a"
 */
export function copyNamespaceNode(namespace, target, canAddNamespace) {
  const prefix = namespace.localName;
  if (prefix === "xml" || !canAddNamespace(target)) return;
  const uri = namespace.nodeValue;
  if ((target.prefix ?? "") === prefix && (target.namespaceURI ?? "") !== uri) {
    return;
  }
  const declared = target.getAttributeNS(XMLNS_NAMESPACE, prefix || "xmlns");
  if (declared !== null && declared !== uri) return;
  target.setAttributeNS(
    XMLNS_NAMESPACE,
    prefix ? `xmlns:${prefix}` : "xmlns",
    uri,
  );
}

/**
 * Create a shallow copy of an element: same expanded name and prefix, and the
 * same namespace declarations.
 *
 * @param {Element} element - The source element
 * @param {Document} doc - The result document
 * @returns {Element} The empty copy
 */
export function shallowCopyElement(element, doc) {
  const copy = element.namespaceURI
    ? doc.createElementNS(element.namespaceURI, element.nodeName)
    : doc.createElement(element.nodeName);
  copyNamespaceDeclarations(element, copy);
  return copy;
}

/**
 * Deep copy of a node that can be a child in the result tree.
 *
 * @param {Node} node - Element, text, CDATA, comment, PI or document fragment
 * @param {Document} doc - The result document
 * @param {(node: Node) => string} stringValue - XPath string value (text runs)
 * @returns {Node|null} The copy, or null for nodes that cannot be children
 *
 * @example
 * cloneNode(sourceElement, resultDocument, (n) => evaluator.getStringValue(n));
 */
export function cloneNode(node, doc, stringValue) {
  switch (node.nodeType) {
    case 1: {
      const copy = shallowCopyElement(node, doc);
      for (const attribute of node.attributes) {
        copyAttribute(attribute, copy, () => true);
      }
      appendChildCopies(node, copy, doc, stringValue);
      return copy;
    }
    case 3:
    case 4:
      return doc.createTextNode(stringValue(node));
    case 7:
      return doc.createProcessingInstruction(node.target, node.data);
    case 8:
      return doc.createComment(node.nodeValue);
    case 11: {
      const fragment = doc.createDocumentFragment();
      appendChildCopies(node, fragment, doc, stringValue);
      return fragment;
    }
    default:
      return null;
  }
}

/**
 * Append deep copies of the (XPath) children of a node.
 *
 * @param {Node} node - The source parent
 * @param {Node} target - The result parent
 * @param {Document} doc - The result document
 * @param {(node: Node) => string} stringValue - XPath string value
 * @returns {void}
 */
function appendChildCopies(node, target, doc, stringValue) {
  for (const child of childAxis(node)) {
    const copy = cloneNode(child, doc, stringValue);
    if (copy) target.appendChild(copy);
  }
}

/**
 * Declare on the copy of an element every namespace in scope on the source
 * element that is not in scope on the result parent already: `xsl:copy-of`
 * copies the namespace nodes of an element (XSLT 1.0 section 11.3), those
 * declared on its ancestors included, as libxslt does for the top element of
 * a copied tree (its descendants inherit them in the result).
 *
 * @param {Element} source - The copied source element
 * @param {Element} copy - Its copy, not yet attached
 * @param {Node} output - The result node receiving the copy
 * @returns {void}
 */
function copyInScopeNamespaces(source, copy, output) {
  const inOutput = (prefix, uri) =>
    output.nodeType === 1 && output.lookupNamespaceURI(prefix || null) === uri;
  for (const [prefix, uri] of inScopeBindings(source)) {
    if (!inOutput(prefix, uri)) {
      copyNamespaceNode(
        { localName: prefix, nodeValue: uri },
        copy,
        () => true,
      );
    }
  }
}

/**
 * Copy the result of an `xsl:copy-of` select expression to the result tree.
 *
 * Node-sets are copied node by node (roots as their children, attributes onto
 * the current result element); any other value is written as text.
 *
 * @param {*} value - The evaluated expression
 * @param {Node} output - The result node receiving the copy
 * @param {object} host - Engine services
 * @param {Document} host.doc - The result document
 * @param {(node: Node) => string} host.stringValue - XPath string value
 * @param {(value: *) => string} host.toString - XPath string() conversion
 * @param {(element: Node) => boolean} host.canAddAttribute - Guard for attributes
 * @returns {void}
 */
export function copyOf(value, output, host) {
  if (Array.isArray(value)) {
    for (const item of value) copyOf(item, output, host);
    return;
  }

  if (value === null || value === undefined) return;
  if (!value.nodeType) {
    const text = host.toString(value);
    if (text) output.appendChild(host.doc.createTextNode(text));
    return;
  }

  if (value.nodeType === 2) {
    copyAttribute(value, output, host.canAddAttribute);
  } else if (value.nodeType === NAMESPACE_NODE) {
    copyNamespaceNode(value, output, host.canAddAttribute);
  } else if (value.nodeType === 9) {
    appendChildCopies(value, output, host.doc, host.stringValue);
  } else {
    const copy = cloneNode(value, host.doc, host.stringValue);
    if (value.nodeType === 1) copyInScopeNamespaces(value, copy, output);
    if (copy) output.appendChild(copy);
  }
}
