/**
 * The place of a node in a document as xsl:number counts it (XSLT 3.0
 * section 12.2): levels single, multiple and any, with count and from
 * patterns.
 *
 * @module @tradik/xslt3/xslt/runtime/numbering
 */

import {
  nodeLocalName,
  nodeNamespace,
  parentOf,
} from "../../xpath/eval/domNodes.js";

/**
 * The default count pattern: nodes of the same kind and name.
 * @param {Node} node
 * @returns {(other: Node) => boolean}
 */
export function sameKindAndName(node) {
  const type = node.nodeType === 4 ? 3 : node.nodeType;
  const local = nodeLocalName(node);
  const uri = nodeNamespace(node);
  return (other) => {
    const otherType = other.nodeType === 4 ? 3 : other.nodeType;
    return (
      otherType === type &&
      nodeLocalName(other) === local &&
      nodeNamespace(other) === uri
    );
  };
}

/**
 * Number of preceding siblings that match, plus one.
 * @param {Node} node
 * @param {(node: Node) => boolean} count
 * @returns {number}
 */
function siblingNumber(node, count) {
  if (node.nodeType === 2 || node.nodeType === 13) return 1;
  let n = 1;
  for (let s = node.previousSibling; s; s = s.previousSibling) {
    if (s.nodeType !== 10 && count(s)) n++;
  }
  return n;
}

/**
 * Ancestors-or-self of a node, innermost first, up to (including) the
 * first one matching `from` (all of them when none matches).
 * @param {Node} node
 * @param {((node: Node) => boolean)|null} from
 * @returns {Node[]}
 */
function ancestorsBelowFrom(node, from) {
  const result = [];
  for (let a = node; a; a = parentOf(a)) {
    result.push(a);
    if (from && from(a)) break;
  }
  return result;
}

/**
 * level="single" and level="multiple".
 * @param {Node} node
 * @param {(node: Node) => boolean} count
 * @param {((node: Node) => boolean)|null} from
 * @param {boolean} multiple
 * @returns {number[]}
 */
export function numberHierarchy(node, count, from, multiple) {
  const numbers = [];
  for (const a of ancestorsBelowFrom(node, from)) {
    if (!count(a)) continue;
    numbers.unshift(siblingNumber(a, count));
    if (!multiple) break;
  }
  return numbers;
}

/**
 * The node before another in document order (preceding or ancestor).
 * @param {Node} node
 * @returns {Node|null}
 */
function previousInDocument(node) {
  if (node.nodeType === 2 || node.nodeType === 13) return parentOf(node);
  const sibling = node.previousSibling;
  if (!sibling) return parentOf(node);
  let last = sibling;
  while (last.lastChild) last = last.lastChild;
  return last;
}

/**
 * level="any".
 * @param {Node} node
 * @param {(node: Node) => boolean} count
 * @param {((node: Node) => boolean)|null} from
 * @returns {number[]}
 */
export function numberAny(node, count, from) {
  let n = 0;
  for (let p = node; p; p = previousInDocument(p)) {
    if (p.nodeType !== 10 && count(p)) n++;
    if (from && from(p)) break;
  }
  return n === 0 ? [] : [n];
}
