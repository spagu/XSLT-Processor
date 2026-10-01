/**
 * Namespace nodes (XDM 3.1 section 6.4), which DOMs do not have: objects
 * with nodeType 13 made for the in-scope namespaces of an element, once
 * per element so that they keep their identity.
 *
 * The in-scope namespaces come from the `xmlns` attributes of the element
 * and its ancestors, the names of the element and its attributes (DOMs
 * built with createElementNS may lack the declarations), and the xml
 * prefix, which is always in scope.
 *
 * @module @tradik/xslt3/xpath/eval/namespaceNodes
 */

import { isNamespaceDeclaration, NODE_TYPES, parentOf } from "./domNodes.js";

/** The namespace bound to the xml prefix. */
export const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

/** A namespace node: prefix ("" for the default namespace) and URI. */
export class NamespaceNode {
  /**
   * @param {Element} element - Parent element
   * @param {string} prefix
   * @param {string} uri
   */
  constructor(element, prefix, uri) {
    this.ownerElement = element;
    this.localName = prefix;
    this.nodeName = prefix;
    this.nodeValue = uri;
    this.namespaceURI = null;
    this.prefix = null;
    this.childNodes = [];
    Object.freeze(this);
  }

  /** @returns {number} 13, the nodeType of namespace nodes */
  get nodeType() {
    return NODE_TYPES.namespace;
  }
}

/** @type {WeakMap<Element, NamespaceNode[]>} */
const cache = new WeakMap();

/**
 * In-scope namespaces of an element as prefix → URI ("" URI: undeclared).
 * @param {Element} element
 * @returns {Map<string, string>}
 */
export function inScopeNamespaces(element) {
  const chain = [];
  for (let e = element; e && e.nodeType === 1; e = parentOf(e)) chain.push(e);
  const bindings = new Map();
  for (const e of chain.reverse()) {
    for (const attribute of e.attributes) {
      if (!isNamespaceDeclaration(attribute)) continue;
      const name = attribute.name ?? attribute.nodeName;
      const prefix = name === "xmlns" ? "" : name.slice(6);
      bindings.set(prefix, attribute.value ?? attribute.nodeValue);
    }
  }
  const declare = (node) => {
    if (node.namespaceURI) bindings.set(node.prefix ?? "", node.namespaceURI);
  };
  declare(element);
  for (const attribute of element.attributes) {
    if (!isNamespaceDeclaration(attribute) && attribute.prefix) {
      declare(attribute);
    }
  }
  bindings.set("xml", XML_NAMESPACE);
  return bindings;
}

/**
 * @param {Element} element
 * @returns {NamespaceNode[]} the namespace nodes of an element
 */
export function namespaceNodesOf(element) {
  let nodes = cache.get(element);
  if (!nodes) {
    nodes = [];
    for (const [prefix, uri] of inScopeNamespaces(element)) {
      if (uri !== "") nodes.push(new NamespaceNode(element, prefix, uri));
    }
    cache.set(element, nodes);
  }
  return nodes;
}
