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
 * @module xpath/axes
 */

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
 * Child nodes in document order.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The children
 */
export function childAxis(node) {
  const result = [];
  let previous = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (!continuesRun(previous, child)) result.push(child);
    previous = child;
  }
  return result;
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
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    if (!isNamespaceDeclaration(attr)) result.push(attr);
  }
  return result;
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
  if (includeSelf) result.push(node);

  let current = node.firstChild;
  let previous = null;
  while (current) {
    if (!continuesRun(previous, current)) result.push(current);
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
  return result;
}

/**
 * Descendants in reverse document order (reverse pre-order): the last
 * descendant first and the node's first child last.
 *
 * @param {Node} node - Subtree root, not included
 * @param {Node[]} result - Array to append to
 * @returns {Node[]} The same array
 */
function reverseDescendants(node, result) {
  let current = node.lastChild;
  while (current) {
    if (current.lastChild) {
      current = current.lastChild;
      continue;
    }
    if (!isTextContinuation(current)) result.push(current);
    while (current !== node && !current.previousSibling) {
      current = current.parentNode;
      if (current !== node) result.push(current);
    }
    current = current === node ? null : current.previousSibling;
  }
  return result;
}

/**
 * Ancestors, nearest first, optionally starting with the node itself.
 *
 * @param {Node} node - Context node
 * @param {boolean} includeSelf - Whether to start with the node itself
 * @returns {Node[]} The ancestors
 */
export function ancestorAxis(node, includeSelf) {
  const result = includeSelf ? [node] : [];
  for (let current = parentOf(node); current; current = current.parentNode) {
    result.push(current);
  }
  return result;
}

/**
 * Following siblings in document order.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The siblings
 */
export function followingSiblingAxis(node) {
  const result = [];
  let previous = node;
  for (let current = node.nextSibling; current; current = current.nextSibling) {
    if (!continuesRun(previous, current)) result.push(current);
    previous = current;
  }
  return result;
}

/**
 * Preceding siblings, nearest first.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The siblings
 */
export function precedingSiblingAxis(node) {
  const result = [];
  for (
    let current = node.previousSibling;
    current;
    current = current.previousSibling
  ) {
    if (!isTextContinuation(current)) result.push(current);
  }
  return result;
}

/**
 * Nodes after the context node in document order, excluding descendants.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The following nodes in document order
 */
export function followingAxis(node) {
  const result = [];
  if (node.nodeType === 2 && node.ownerElement) {
    // An attribute precedes the children of its owner element.
    descendantAxis(node.ownerElement, false, result);
  }
  for (let current = startOf(node); current; current = current.parentNode) {
    let previous = current;
    for (
      let sibling = current.nextSibling;
      sibling;
      sibling = sibling.nextSibling
    ) {
      if (!continuesRun(previous, sibling)) {
        descendantAxis(sibling, true, result);
      }
      previous = sibling;
    }
  }
  return result;
}

/**
 * Nodes before the context node, excluding ancestors, nearest first.
 *
 * @param {Node} node - Context node
 * @returns {Node[]} The preceding nodes in reverse document order
 */
export function precedingAxis(node) {
  const result = [];
  for (let current = startOf(node); current; current = current.parentNode) {
    for (
      let sibling = current.previousSibling;
      sibling;
      sibling = sibling.previousSibling
    ) {
      reverseDescendants(sibling, result);
      if (!isTextContinuation(sibling)) result.push(sibling);
    }
  }
  return result;
}

/**
 * Parent of a node; for an attribute this is its owner element.
 *
 * @param {Node} node - Any node
 * @returns {Node|null} The parent
 */
function parentOf(node) {
  return node.nodeType === 2 ? node.ownerElement : node.parentNode;
}

/**
 * Starting point for the following/preceding axes: an attribute behaves as
 * if it were positioned at its owner element.
 *
 * @param {Node} node - Context node
 * @returns {Node} The node whose siblings and ancestors are walked
 */
function startOf(node) {
  return node.nodeType === 2 ? node.ownerElement : node;
}
