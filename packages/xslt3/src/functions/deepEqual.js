/**
 * fn:deep-equal (F&O 3.1 section 14.2.1) for atomic values and DOM nodes
 * of any implementation (nodeType, namespaceURI, localName, nodeName,
 * nodeValue, attributes and childNodes are read).
 *
 * Maps, arrays and function items are delegated to the hook
 * `options.deepEqualItem(a, b, options)`, which the evaluator supplies
 * through the dynamic context (`context.deepEqualItem`) because it owns
 * their representation. Without the hook such items raise FOTY0015.
 *
 * @module @tradik/xslt3/functions/deepEqual
 */

import { XPathError } from "../errors.js";
import { deepEqualAtomic } from "../xdm/compare.js";
import { isAtomic, isNode } from "../xdm/atomic.js";
import { nodeStringValue } from "../xdm/nodes.js";

const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const ELEMENT = 1;
const ATTRIBUTE = 2;
const PROCESSING_INSTRUCTION = 7;
const COMMENT = 8;
const DOCUMENT = 9;
const DOCUMENT_FRAGMENT = 11;

/**
 * @typedef {object} DeepEqualOptions
 * @property {(a: string, b: string) => number} collation
 * @property {number} implicitTimezone
 * @property {(a: *, b: *, options: DeepEqualOptions) => boolean} [deepEqualItem]
 */

/** @param {Node} node @returns {string} "{uri}local" */
const expandedName = (node) =>
  `{${node.namespaceURI ?? ""}}${node.localName ?? node.nodeName}`;

/** @param {Node} node @returns {Node[]} children without comments and PIs */
const significantChildren = (node) =>
  Array.from(node.childNodes).filter(
    (child) =>
      child.nodeType !== COMMENT && child.nodeType !== PROCESSING_INSTRUCTION,
  );

/** @param {Element} node @returns {Attr[]} attributes without namespace declarations */
const realAttributes = (node) =>
  Array.from(node.attributes ?? []).filter(
    (attr) => attr.namespaceURI !== XMLNS_NAMESPACE,
  );

/**
 * @param {Node} a
 * @param {Node} b
 * @param {DeepEqualOptions} options
 * @returns {boolean} whether two nodes are deep-equal
 */
export function deepEqualNodes(a, b, options) {
  const kind = (node) =>
    node.nodeType === DOCUMENT_FRAGMENT ? DOCUMENT : node.nodeType;
  if (kind(a) !== kind(b)) return false;
  const sameText = () =>
    options.collation(nodeStringValue(a), nodeStringValue(b)) === 0;
  switch (kind(a)) {
    case DOCUMENT:
      return childrenEqual(a, b, options);
    case ELEMENT: {
      if (expandedName(a) !== expandedName(b)) return false;
      const attributes = realAttributes(a);
      const others = realAttributes(b);
      return (
        attributes.length === others.length &&
        attributes.every((attr) =>
          others.some((other) => deepEqualNodes(attr, other, options)),
        ) &&
        childrenEqual(a, b, options)
      );
    }
    case ATTRIBUTE:
    case PROCESSING_INSTRUCTION:
      return expandedName(a) === expandedName(b) && sameText();
    default:
      // text, comment and namespace nodes
      return sameText();
  }
}

/**
 * @param {Node} a
 * @param {Node} b
 * @param {DeepEqualOptions} options
 * @returns {boolean} whether the significant children are pairwise equal
 */
function childrenEqual(a, b, options) {
  const x = significantChildren(a);
  const y = significantChildren(b);
  return (
    x.length === y.length &&
    x.every((child, i) => deepEqualNodes(child, y[i], options))
  );
}

/**
 * @param {*} a
 * @param {*} b
 * @param {DeepEqualOptions} options
 * @returns {boolean} whether two items are deep-equal
 * @throws {XPathError} FOTY0015 for function items without the hook
 */
function deepEqualItems(a, b, options) {
  if (isAtomic(a) || isAtomic(b)) {
    return isAtomic(a) && isAtomic(b) && deepEqualAtomic(a, b, options);
  }
  if (isNode(a) || isNode(b)) {
    return isNode(a) && isNode(b) && deepEqualNodes(a, b, options);
  }
  if (options.deepEqualItem) return options.deepEqualItem(a, b, options);
  throw new XPathError("FOTY0015", "deep-equal of function items");
}

/**
 * Whether two sequences are deep-equal.
 * @param {Array<*>} a
 * @param {Array<*>} b
 * @param {DeepEqualOptions} options
 * @returns {boolean}
 */
export function deepEqualSequences(a, b, options) {
  return (
    a.length === b.length &&
    a.every((item, i) => deepEqualItems(item, b[i], options))
  );
}
