/**
 * The XDM view of DOM nodes, for any DOM implementation (browsers, jsdom,
 * @xmldom/xmldom): node kinds, names, parents, children and attributes.
 *
 * - Document fragments are document nodes; CDATA sections are text nodes
 *   (adjacent text nodes are not merged); document type nodes are skipped.
 * - Namespace declarations (`xmlns` attributes) are namespace nodes, never
 *   attributes.
 * - Namespace nodes are the objects of namespaceNodes.js (nodeType 13).
 *
 * @module @tradik/xslt3/xpath/eval/domNodes
 */

/** DOM nodeType values. */
export const NODE_TYPES = Object.freeze({
  element: 1,
  attribute: 2,
  text: 3,
  cdata: 4,
  processingInstruction: 7,
  comment: 8,
  document: 9,
  documentType: 10,
  fragment: 11,
  namespace: 13,
});

/** Namespace of `xmlns` attributes. */
export const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

/** XDM node kinds by DOM nodeType. */
const KINDS = {
  1: "element",
  2: "attribute",
  3: "text",
  4: "text",
  7: "processing-instruction",
  8: "comment",
  9: "document",
  11: "document",
  13: "namespace",
};

/** @param {Node} node @returns {string|undefined} the XDM node kind */
export const nodeKind = (node) => KINDS[node.nodeType];

/**
 * @param {Node} attribute
 * @returns {boolean} whether an attribute is a namespace declaration
 */
export function isNamespaceDeclaration(attribute) {
  if (attribute.namespaceURI === XMLNS_NAMESPACE) return true;
  const name = attribute.name ?? attribute.nodeName;
  return (
    !attribute.namespaceURI && (name === "xmlns" || name.startsWith("xmlns:"))
  );
}

/**
 * @param {Node} node
 * @returns {Node|null} the parent in XDM terms (the element of an
 *   attribute or namespace node)
 */
export function parentOf(node) {
  const type = node.nodeType;
  if (type === 2 || type === 13) return node.ownerElement ?? null;
  return node.parentNode ?? null;
}

/**
 * @param {Node} node
 * @returns {boolean} whether the node is an XDM node (not a document type)
 */
export const isXdmNode = (node) => KINDS[node.nodeType] !== undefined;

/**
 * @param {Node} node
 * @returns {boolean} whether the node can have children (element,
 *   document, document fragment)
 */
export const isContainer = (node) => {
  const type = node.nodeType;
  return type === 1 || type === 9 || type === 11;
};

/**
 * @param {Node} node
 * @returns {Node[]} the children in XDM terms
 */
export function childrenOf(node) {
  if (!isContainer(node)) return [];
  const result = [];
  // firstChild/nextSibling: childNodes is a live list behind a Proxy in
  // jsdom, several times slower to iterate
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (isXdmNode(child)) result.push(child);
  }
  return result;
}

/**
 * @param {Node} node
 * @returns {Attr[]} the attributes of an element, without namespace
 *   declarations; none for other nodes
 */
export function attributesOf(node) {
  if (node.nodeType !== 1) return [];
  const attributes = node.attributes;
  const result = [];
  for (let i = 0, n = attributes.length; i < n; i++) {
    const attribute = attributes[i];
    if (!isNamespaceDeclaration(attribute)) result.push(attribute);
  }
  return result;
}

/**
 * The attribute of an element with a name, without walking its attribute
 * list (slow in jsdom).
 * @param {Node} node
 * @param {string} uri - Namespace URI, "" for none
 * @param {string} local - Local name
 * @returns {Attr|null} the attribute, null when the element has none of
 *   that name (or the node is not an element); undefined when the DOM
 *   cannot look attributes up by name
 */
export function namedAttributeOf(node, uri, local) {
  if (node.nodeType !== 1) return null;
  if (typeof node.getAttributeNodeNS !== "function") return undefined;
  const attribute = node.getAttributeNodeNS(uri === "" ? null : uri, local);
  return attribute && !isNamespaceDeclaration(attribute) ? attribute : null;
}

/** @param {Node} node @returns {string} namespace URI of the name, "" for none */
export const nodeNamespace = (node) => node.namespaceURI ?? "";

/**
 * @param {Node} node
 * @returns {string} local part of the node name: the target of a
 *   processing instruction, the prefix of a namespace node, "" for unnamed
 *   nodes
 */
export function nodeLocalName(node) {
  switch (node.nodeType) {
    case 1:
    case 2:
      return node.localName ?? node.nodeName;
    case 7:
      return node.target ?? node.nodeName;
    case 13:
      return node.localName;
    default:
      return "";
  }
}

/**
 * @param {Node} node
 * @returns {string} prefix of an element or attribute name, "" for none
 */
export const nodePrefix = (node) =>
  node.nodeType === 1 || node.nodeType === 2 ? (node.prefix ?? "") : "";

/**
 * @param {Node} node
 * @returns {Node} the root of the tree containing the node
 */
export function rootOf(node) {
  let current = node;
  for (let parent = parentOf(current); parent; parent = parentOf(current)) {
    current = parent;
  }
  return current;
}
