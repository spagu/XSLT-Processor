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
 * The key of the default count pattern of a node (see sameKindAndName):
 * numbers memoized for one key are not valid for another.
 * @param {Node} node
 * @returns {string}
 */
export function countKey(node) {
  const type = node.nodeType === 4 ? 3 : node.nodeType;
  return `${type}|${nodeNamespace(node) ?? ""}|${nodeLocalName(node)}`;
}

/**
 * The memo of an xsl:number instruction in a transformation: the numbers
 * already given to nodes, so that numbering a long list stays linear.
 * Only valid while counting depends on nothing but the tree: the caller
 * does not memoize patterns that read variables.
 * @param {object} tx - The transformation (holds the memos)
 * @param {object} instruction - Identity of the instruction
 * @param {string} key - The count pattern ("" for an explicit one, else
 *   the {@link countKey} of the numbered node)
 * @returns {WeakMap<Node, number>}
 */
export function numberMemo(tx, instruction, key) {
  tx.numberMemos ??= new WeakMap();
  let byKey = tx.numberMemos.get(instruction);
  if (!byKey) tx.numberMemos.set(instruction, (byKey = new Map()));
  let memo = byKey.get(key);
  if (!memo) byKey.set(key, (memo = new WeakMap()));
  return memo;
}

/**
 * Number of preceding siblings that match, plus one; the walk stops at a
 * sibling whose number is memoized (a counted node: its number includes
 * itself and the counted siblings before it).
 * @param {Node} node - A counted node
 * @param {(node: Node) => boolean} count
 * @param {WeakMap<Node, number>|null} memo
 * @returns {number}
 */
function siblingNumber(node, count, memo) {
  if (node.nodeType === 2 || node.nodeType === 13) return 1;
  const own = memo?.get(node);
  if (own !== undefined) return own;
  let n = 1;
  for (let s = node.previousSibling; s; s = s.previousSibling) {
    const known = memo?.get(s);
    if (known !== undefined) {
      n += known;
      break;
    }
    if (s.nodeType !== 10 && count(s)) n++;
  }
  memo?.set(node, n);
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
 * @param {WeakMap<Node, number>|null} [memo] - Sibling numbers already
 *   computed with the same count pattern (see numberMemo)
 * @returns {number[]}
 */
export function numberHierarchy(node, count, from, multiple, memo = null) {
  const numbers = [];
  for (const a of ancestorsBelowFrom(node, from)) {
    if (!count(a)) continue;
    numbers.unshift(siblingNumber(a, count, memo));
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
 * level="any": the counted nodes met walking back in document order from
 * the node to a `from` node or the root. The walk from a node is the walk
 * from any node it meets, so it stops at a node whose total is memoized:
 * numbering in document order (for-each, apply-templates) only walks back
 * to the node numbered before, and is linear instead of quadratic. In
 * other orders nothing memoized is met and the walk is complete.
 * @param {Node} node
 * @param {(node: Node) => boolean} count
 * @param {((node: Node) => boolean)|null} from
 * @param {WeakMap<Node, number>|null} [memo] - Totals already computed
 *   with the same count and from patterns (see numberMemo)
 * @returns {number[]}
 */
export function numberAny(node, count, from, memo = null) {
  let n = 0;
  for (let p = node; p; p = previousInDocument(p)) {
    const known = memo?.get(p);
    if (known !== undefined) {
      n += known;
      break;
    }
    if (p.nodeType !== 10 && count(p)) n++;
    if (from && from(p)) break;
  }
  memo?.set(node, n);
  return n === 0 ? [] : [n];
}
