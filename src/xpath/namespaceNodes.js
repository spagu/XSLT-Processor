/**
 * Namespace nodes and the `namespace` axis (XPath 1.0 sections 2.2, 5.4).
 *
 * The DOM has no namespace nodes, so they are synthesized: an element has one
 * namespace node for every namespace binding in scope on it, the implicit
 * `xml` binding included, and an undeclared default namespace (`xmlns=""`)
 * has none. Bindings come from `xmlns` attributes of the element and its
 * ancestors and, for trees built with `createElementNS`, from the prefixes of
 * the element and attribute names themselves. HTML documents are treated as
 * libxslt sees them after re-parsing their markup: their elements are in no
 * namespace, so only explicit `xmlns` attributes (and `xml`) bind prefixes.
 *
 * A namespace node looks like a DOM node where the processor reads one:
 * `nodeType` 13, `localName`/`nodeName` = the prefix ("" for the default
 * namespace), `namespaceURI` = null (the expanded-name of a namespace node
 * has a null URI), `nodeValue`/`textContent` = the namespace URI and
 * `ownerElement` = its parent element. Nodes are created once per element and
 * cache, so the same binding is the same object: unions deduplicate it and
 * `generate-id()` is stable. In document order the namespace nodes of an
 * element follow the element and precede its attributes (section 5).
 *
 * @module xpath/namespaceNodes
 */

"use strict";

/** Node type of a namespace node (the DOM XPath XPathNamespace type). */
export const NAMESPACE_NODE = 13;

/** Namespace bound to the `xml` prefix (Namespaces in XML 1.0). */
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

/** Namespace of `xmlns` and `xmlns:*` attributes. */
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

/**
 * A synthesized XPath namespace node.
 */
export class NamespaceNode {
  /**
   * @param {Element} element - The element the node belongs to (its parent)
   * @param {string} prefix - The bound prefix, "" for the default namespace
   * @param {string} uri - The namespace URI
   * @param {number} index - Position among the element's namespace nodes
   */
  constructor(element, prefix, uri, index) {
    this.nodeType = NAMESPACE_NODE;
    this.ownerElement = element;
    this.ownerDocument = element.ownerDocument;
    this.localName = prefix;
    this.nodeName = prefix;
    this.namespaceURI = null;
    this.prefix = null;
    this.nodeValue = uri;
    this.textContent = uri;
    this.index = index;
    this.parentNode = null;
    this.firstChild = null;
    this.lastChild = null;
    this.previousSibling = null;
    this.nextSibling = null;
    this.childNodes = [];
  }
}

/**
 * Whether a node is a synthesized namespace node.
 *
 * @param {*} node - Any value
 * @returns {boolean} True for namespace nodes
 */
export function isNamespaceNode(node) {
  return node?.nodeType === NAMESPACE_NODE;
}

/**
 * The prefix declared by an `xmlns` or `xmlns:*` attribute.
 *
 * @param {Attr} attr - Any attribute
 * @returns {string|null} The prefix ("" for `xmlns`), or null for any other attribute
 */
function declaredPrefix(attr) {
  const name = attr.name;
  if (name === "xmlns") return "";
  return name.startsWith("xmlns:") ? name.slice(6) : null;
}

/**
 * Record the bindings one element contributes, nearest binding first: an
 * ancestor cannot override what a descendant already bound.
 *
 * @param {Element} element - An element on the ancestor-or-self axis
 * @param {boolean} fromNames - Whether prefixes of element and attribute names count
 * @param {Map<string, string>} bindings - URIs by prefix, "" marking an undeclared prefix
 * @returns {void}
 */
function addBindings(element, fromNames, bindings) {
  const bind = (prefix, uri) => {
    if (prefix !== "xml" && !bindings.has(prefix)) bindings.set(prefix, uri);
  };
  for (const attr of element.attributes) {
    const prefix = declaredPrefix(attr);
    if (prefix !== null) bind(prefix, attr.value);
  }
  if (!fromNames) return;
  bind(element.prefix ?? "", element.namespaceURI ?? "");
  for (const attr of element.attributes) {
    if (attr.prefix && attr.namespaceURI !== XMLNS_NAMESPACE) {
      bind(attr.prefix, attr.namespaceURI);
    }
  }
}

/**
 * The namespace bindings in scope on an element, `xml` first.
 *
 * @param {Element} element - The element
 * @returns {Array<[string, string]>} `[prefix, uri]` pairs
 *
 * @example
 * // <r xmlns:a="u"/>
 * inScopeBindings(r); // [["xml", "http://www.w3.org/XML/1998/namespace"], ["a", "u"]]
 */
export function inScopeBindings(element) {
  const fromNames = element.ownerDocument?.contentType !== "text/html";
  const bindings = new Map();
  for (let node = element; node?.nodeType === 1; node = node.parentNode) {
    addBindings(node, fromNames, bindings);
  }
  const result = [["xml", XML_NAMESPACE]];
  for (const [prefix, uri] of bindings) {
    if (uri !== "") result.push([prefix, uri]);
  }
  return result;
}

/**
 * The namespace axis of a node: the namespace nodes of an element, nothing
 * for any other node. Nodes are cached per element in `cache`, so repeated
 * evaluations return identical objects.
 *
 * @param {Node} node - Context node
 * @param {WeakMap<Element, NamespaceNode[]>} cache - Namespace nodes by element
 * @returns {NamespaceNode[]} The namespace nodes, in document order
 *
 * @example
 * namespaceAxis(element, new WeakMap()).map((ns) => ns.localName); // ["xml", "a"]
 */
export function namespaceAxis(node, cache) {
  if (node.nodeType !== 1) return [];
  let nodes = cache.get(node);
  if (!nodes) {
    nodes = inScopeBindings(node).map(
      ([prefix, uri], index) => new NamespaceNode(node, prefix, uri, index),
    );
    cache.set(node, nodes);
  }
  return nodes.slice();
}

/**
 * Match a name test against a namespace node: its name is the prefix, with a
 * null namespace URI, so only unprefixed tests can match (section 2.3).
 *
 * @param {{name: string, prefix: (string|null)}} nodeTest - Name test AST node
 * @param {NamespaceNode} node - The namespace node
 * @returns {boolean} Whether the node matches
 */
export function matchNamespaceNameTest(nodeTest, node) {
  if (nodeTest.prefix) return false;
  return nodeTest.name === "*" || nodeTest.name === node.localName;
}
