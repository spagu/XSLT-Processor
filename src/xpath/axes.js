/**
 * XPath 1.0 axes (section 2.2).
 *
 * Every axis is walked with `firstChild`, `nextSibling`, `previousSibling`,
 * `lastChild` and `parentNode` instead of indexing `childNodes`: in jsdom each
 * `childNodes[i]` access goes through a Proxy and was the single largest cost
 * of a transformation. Results are built with `push` only, never with spread
 * arguments, so very wide documents cannot overflow the call stack.
 *
 * Forward axes return nodes in document order. Reverse axes (`ancestor`,
 * `ancestor-or-self`, `preceding`, `preceding-sibling`) return nodes in
 * reverse document order, nearest first, so that predicates see proximity
 * positions: `preceding-sibling::*[1]` is the nearest preceding sibling.
 *
 * The XPath data model has no CDATA sections and never has two adjacent text
 * nodes (section 5.7), while the DOM may have both. A run of adjacent Text and
 * CDATASection siblings is therefore one XPath text node, represented by the
 * first DOM node of the run: the axes never return the other nodes of a run,
 * and the evaluator gives the first node the string value of the whole run.
 * Forward walks remember the previous sibling, so recognising a run costs no
 * extra DOM access.
 *
 * A document has no text children, in the DOM as in XPath (section 5.1),
 * and the XML declaration is not a processing instruction. xmldom keeps
 * both anyway: the whitespace between top-level nodes as Text nodes and the
 * declaration as a processing instruction named `xml`. The axes skip these
 * artifacts among the children of a document.
 *
 * @module xpath/axes
 */

import { NAMESPACE_NODE } from "./namespaceNodes.js";

/** Namespace of `xmlns` and `xmlns:*` attributes (Namespaces in XML 1.0). */
export const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

/**
 * Whether a node is a DOM Text or CDATASection node.
 *
 * @param {Node|null} node - Any node
 * @returns {boolean} True for text and CDATA nodes
 */
export function isTextNode(node) {
  if (!node) return false;
  const type = node.nodeType;
  return type === 3 || type === 4;
}

/**
 * Whether a node continues a run of adjacent text/CDATA nodes, that is,
 * whether it is not the node that represents the run in the XPath data model.
 *
 * @param {Node} node - Any node
 * @returns {boolean} True when the node directly follows another text node
 *
 * @example
 * // <r>a<![CDATA[b]]></r>: only the "a" node is an XPath text node
 * isTextContinuation(cdataNode); // true
 */
export function isTextContinuation(node) {
  return isTextNode(node) && isTextNode(node.previousSibling);
}

/**
 * Whether `node` continues a text run given its previous sibling.
 *
 * @param {Node|null} previous - The previous sibling, or null for a first child
 * @param {Node} node - The node
 * @returns {boolean} True when both are text nodes
 */
function continuesRun(previous, node) {
  return isTextNode(previous) && isTextNode(node);
}

/**
 * Whether an attribute is a namespace declaration. Parsed XML documents put
 * them in the xmlns namespace; attributes of HTML documents or created with
 * `setAttribute` only carry the `xmlns` name.
 *
 * @param {Attr} attr - An attribute node
 * @returns {boolean} True for `xmlns` and `xmlns:*` attributes
 */
function isNamespaceDeclaration(attr) {
  const namespaceUri = attr.namespaceURI;
  if (namespaceUri === XMLNS_NAMESPACE) return true;
  if (namespaceUri !== null) return false;
  const name = attr.name;
  return name === "xmlns" || name.startsWith("xmlns:");
}

/** Axes whose proximity positions run in reverse document order. */
export const REVERSE_AXES = new Set([
  "ancestor",
  "ancestor-or-self",
  "preceding",
  "preceding-sibling",
]);

/**
 * An axis walker calls `visit` for every node of an axis, in axis order
 * (proximity order for reverse axes), and stops as soon as `visit` returns
 * true. It returns whether the walk was stopped, so walkers can be nested.
 * Walking lets the evaluator stop after the n-th node of `axis::test[n]`
 * instead of materializing the whole axis.
 *
 * @callback AxisVisitor
 * @param {Node} node - A node on the axis
 * @returns {boolean} True to stop the walk
 */

/**
 * Collect every node an axis walker visits.
 *
 * @param {(node: Node, visit: AxisVisitor) => boolean} walk - Axis walker
 * @param {Node} node - Context node
 * @returns {Node[]} The nodes, in axis order
 */
function collect(walk, node) {
  const result = [];
  walk(node, (found) => {
    result.push(found);
    return false;
  });
  return result;
}

/**
 * Whether a child of a document is an artifact of the parser rather than a
 * node of the data model (see the module comment): text, or the XML
 * declaration as a processing instruction (the `xml` target is reserved).
 *
 * @param {Node} node - A child of a document
 * @returns {boolean} True for nodes the axes skip
 */
function isDocumentArtifact(node) {
  const type = node.nodeType;
  return type === 3 || type === 4 || (type === 7 && node.target === "xml");
}

/**
 * Whether a node is a child of a document, where artifacts may be.
 *
 * @param {Node} node - Any node
 * @returns {boolean} True when the parent is a Document
 */
function isDocumentChild(node) {
  return node.parentNode?.nodeType === 9;
}

/**
 * Whether a node is a parser artifact among the children of a document
 * (see the module comment), for walks that do not go through the axes.
 *
 * @param {Node} node - Any node
 * @returns {boolean} True for the artifacts the axes skip
 *
 * @example
 * // xmldom: <?xml version="1.0"?><r/>
 * isParserArtifact(doc.firstChild); // true
 */
export function isParserArtifact(node) {
  return isDocumentArtifact(node) && isDocumentChild(node);
}

/**
 * Skip test of a sibling among the children of a document.
 *
 * @param {Node|null} previous - The previous sibling (unused)
 * @param {Node} node - The sibling
 * @returns {boolean} True for an artifact
 */
function skipsArtifact(previous, node) {
  return isDocumentArtifact(node);
}

/**
 * How forward sibling walks skip siblings of a node: document artifacts
 * among the children of a document, text run continuations elsewhere.
 *
 * @param {Node} node - A node whose siblings are walked
 * @returns {(previous: Node|null, node: Node) => boolean} The skip test
 */
function forwardSkipOf(node) {
  return isDocumentChild(node) ? skipsArtifact : continuesRun;
}

/**
 * Walk the children of a document in document order, without artifacts.
 *
 * @param {Document} doc - A document
 * @param {AxisVisitor} visit - Visitor
 * @returns {boolean} True when the visitor stopped the walk
 */
function walkDocumentChildren(doc, visit) {
  for (let child = doc.firstChild; child; child = child.nextSibling) {
    if (!isDocumentArtifact(child) && visit(child)) return true;
  }
  return false;
}

/**
 * Walk the children of a node in document order.
 *
 * @param {Node} node - Context node
 * @param {AxisVisitor} visit - Visitor
 * @returns {boolean} True when the visitor stopped the walk
 */
export function walkChildren(node, visit) {
  if (node.nodeType === 9) return walkDocumentChildren(node, visit);
  let previous = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!continuesRun(previous, child) && visit(child)) return true;
    previous = child;
  }
  return false;
}

/**
 * Child nodes in document order.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The children
 */
export function childAxis(node) {
  return collect(walkChildren, node);
}

/**
 * Attributes of an element, without namespace declarations: XPath models
 * those on the namespace axis, never on the attribute axis.
 *
 * @param {Node} node - Context node
 * @returns {Attr[]} The attributes
 */
export function attributeAxis(node) {
  const result = [];
  const attributes = node.attributes;
  if (!attributes) return result;
  for (const attr of attributes) {
    if (!isNamespaceDeclaration(attr)) result.push(attr);
  }
  return result;
}

/**
 * Walk the descendants of a node in document order (pre-order), optionally
 * starting with the node itself.
 *
 * @param {Node} node - Context node
 * @param {boolean} includeSelf - Whether to visit the node itself first
 * @param {AxisVisitor} visit - Visitor
 * @returns {boolean} True when the visitor stopped the walk
 */
export function walkDescendants(node, includeSelf, visit) {
  if (includeSelf && visit(node)) return true;
  if (node.nodeType === 9) {
    return walkDocumentChildren(node, (child) =>
      walkDescendants(child, true, visit),
    );
  }

  let current = node.firstChild;
  let previous = null;
  while (current) {
    if (!continuesRun(previous, current) && visit(current)) return true;
    if (current.firstChild) {
      current = current.firstChild;
      previous = null;
      continue;
    }
    while (current && current !== node && !current.nextSibling) {
      current = current.parentNode;
    }
    previous = current;
    current = current && current !== node ? current.nextSibling : null;
  }
  return false;
}

/**
 * Descendants in document order (pre-order), optionally with the node itself.
 *
 * @param {Node} node - Context node
 * @param {boolean} includeSelf - Whether to start with the node itself
 * @param {Node[]} [result] - Array to append to
 * @returns {Node[]} The descendants
 */
export function descendantAxis(node, includeSelf, result = []) {
  walkDescendants(node, includeSelf, (found) => {
    result.push(found);
    return false;
  });
  return result;
}

/**
 * Walk the descendants of a node in reverse document order (reverse
 * pre-order): the last descendant first and the node's first child last.
 *
 * @param {Node} node - Subtree root, not visited
 * @param {AxisVisitor} visit - Visitor
 * @returns {boolean} True when the visitor stopped the walk
 */
function walkReverseDescendants(node, visit) {
  let current = node.lastChild;
  while (current) {
    if (current.lastChild) {
      current = current.lastChild;
      continue;
    }
    if (!isTextContinuation(current) && visit(current)) return true;
    while (current !== node && !current.previousSibling) {
      current = current.parentNode;
      if (current !== node && visit(current)) return true;
    }
    current = current === node ? null : current.previousSibling;
  }
  return false;
}

/**
 * Walk the ancestors of a node, nearest first, optionally starting with the
 * node itself.
 *
 * @param {Node} node - Context node
 * @param {boolean} includeSelf - Whether to visit the node itself first
 * @param {AxisVisitor} visit - Visitor
 * @returns {boolean} True when the visitor stopped the walk
 */
export function walkAncestors(node, includeSelf, visit) {
  if (includeSelf && visit(node)) return true;
  for (let current = parentOf(node); current; current = current.parentNode) {
    if (visit(current)) return true;
  }
  return false;
}

/**
 * Ancestors, nearest first, optionally starting with the node itself.
 *
 * @param {Node} node - Context node
 * @param {boolean} includeSelf - Whether to start with the node itself
 * @returns {Node[]} The ancestors
 */
export function ancestorAxis(node, includeSelf) {
  return collect(
    (start, visit) => walkAncestors(start, includeSelf, visit),
    node,
  );
}

/**
 * Walk the following siblings of a node in document order. Attributes have
 * no siblings.
 *
 * @param {Node} node - Context node
 * @param {AxisVisitor} visit - Visitor
 * @returns {boolean} True when the visitor stopped the walk
 */
export function walkFollowingSiblings(node, visit) {
  if (node.nodeType === 2) return false;
  const skip = forwardSkipOf(node);
  let previous = node;
  for (let current = node.nextSibling; current; current = current.nextSibling) {
    if (!skip(previous, current) && visit(current)) return true;
    previous = current;
  }
  return false;
}

/**
 * Following siblings in document order.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The siblings
 */
export function followingSiblingAxis(node) {
  return collect(walkFollowingSiblings, node);
}

/**
 * Walk the preceding siblings of a node, nearest first. Attributes have no
 * siblings.
 *
 * @param {Node} node - Context node
 * @param {AxisVisitor} visit - Visitor
 * @returns {boolean} True when the visitor stopped the walk
 */
export function walkPrecedingSiblings(node, visit) {
  if (node.nodeType === 2) return false;
  const skip = isDocumentChild(node) ? isDocumentArtifact : isTextContinuation;
  for (
    let current = node.previousSibling;
    current;
    current = current.previousSibling
  ) {
    if (!skip(current) && visit(current)) return true;
  }
  return false;
}

/**
 * Preceding siblings, nearest first.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The siblings
 */
export function precedingSiblingAxis(node) {
  return collect(walkPrecedingSiblings, node);
}

/**
 * Walk the nodes after the context node in document order, excluding its
 * descendants.
 *
 * @param {Node} node - Context node
 * @param {AxisVisitor} visit - Visitor
 * @returns {boolean} True when the visitor stopped the walk
 */
export function walkFollowing(node, visit) {
  // An attribute or namespace node precedes the children of its element.
  if (
    hasOwnerElement(node) &&
    node.ownerElement &&
    walkDescendants(node.ownerElement, false, visit)
  ) {
    return true;
  }
  for (let current = startOf(node); current; current = current.parentNode) {
    const skip = forwardSkipOf(current);
    let previous = current;
    for (
      let sibling = current.nextSibling;
      sibling;
      sibling = sibling.nextSibling
    ) {
      if (!skip(previous, sibling) && walkDescendants(sibling, true, visit)) {
        return true;
      }
      previous = sibling;
    }
  }
  return false;
}

/**
 * Nodes after the context node in document order, excluding descendants.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The following nodes in document order
 */
export function followingAxis(node) {
  return collect(walkFollowing, node);
}

/**
 * Walk the nodes before the context node, excluding its ancestors, nearest
 * first.
 *
 * @param {Node} node - Context node
 * @param {AxisVisitor} visit - Visitor
 * @returns {boolean} True when the visitor stopped the walk
 */
export function walkPreceding(node, visit) {
  for (let current = startOf(node); current; current = current.parentNode) {
    const artifacts = isDocumentChild(current);
    for (
      let sibling = current.previousSibling;
      sibling;
      sibling = sibling.previousSibling
    ) {
      if (artifacts && isDocumentArtifact(sibling)) continue;
      if (walkReverseDescendants(sibling, visit)) return true;
      if (!isTextContinuation(sibling) && visit(sibling)) return true;
    }
  }
  return false;
}

/**
 * Nodes before the context node, excluding ancestors, nearest first.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The preceding nodes in reverse document order
 */
export function precedingAxis(node) {
  return collect(walkPreceding, node);
}

/**
 * Walkers of the axes that can be walked lazily, by axis name.
 *
 * @type {Readonly<Object<string, (node: Node, visit: AxisVisitor) => boolean>>}
 */
export const AXIS_WALKERS = Object.freeze({
  child: walkChildren,
  descendant: (node, visit) => walkDescendants(node, false, visit),
  "descendant-or-self": (node, visit) => walkDescendants(node, true, visit),
  ancestor: (node, visit) => walkAncestors(node, false, visit),
  "ancestor-or-self": (node, visit) => walkAncestors(node, true, visit),
  "following-sibling": walkFollowingSiblings,
  "preceding-sibling": walkPrecedingSiblings,
  following: walkFollowing,
  preceding: walkPreceding,
});

/**
 * The root node of the tree containing a node (XPath 2.1): the topmost
 * ancestor when that is a Document or a DocumentFragment (a result tree
 * fragment converted with `exsl:node-set()`), otherwise, for a node that is
 * not attached to any such tree, its owner document.
 *
 * @param {Node} node - Any node
 * @returns {Node} The root node
 *
 * @example
 * rootNodeOf(fragment.firstChild); // fragment
 */
export function rootNodeOf(node) {
  const owner = node.ownerDocument;
  let top = parentOf(node) ?? node;
  // Stop at the owner document without reading its properties: a jsdom
  // Document is a Proxy (named properties), slow on every access
  while (top !== owner && top.parentNode) top = top.parentNode;
  if (top === owner) return owner;
  const type = top.nodeType;
  return type === 9 || type === 11 ? top : node.ownerDocument || top;
}

/**
 * Whether a node's parent is its `ownerElement`: attributes and (synthesized)
 * namespace nodes, which are not children of their element.
 *
 * @param {Node} node - Any node
 * @returns {boolean} True for attribute and namespace nodes
 */
function hasOwnerElement(node) {
  const type = node.nodeType;
  return type === 2 || type === NAMESPACE_NODE;
}

/**
 * Parent of a node in the XPath data model; for an attribute or a namespace
 * node this is its element.
 *
 * @param {Node} node - Any node
 * @returns {Node|null} The parent
 */
export function parentOf(node) {
  return hasOwnerElement(node) ? node.ownerElement : node.parentNode;
}

/**
 * Starting point for the following/preceding axes: an attribute or
 * namespace node behaves as if it were positioned at its element.
 *
 * @param {Node} node - Context node
 * @returns {Node} The node whose siblings and ancestors are walked
 */
function startOf(node) {
  return hasOwnerElement(node) ? node.ownerElement : node;
}
