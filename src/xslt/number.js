/**
 * `xsl:number` counting (XSLT 1.0 section 7.7).
 *
 * Counting is kept independent from the engine: callers pass a `matcher`
 * callback that answers "does this node match this XSLT pattern", which keeps
 * this module free of the XPath evaluator and easy to test in isolation.
 *
 * Numbering every node of a long list would be quadratic if each call counted
 * from scratch, so a call may be given a memo (one per instruction and
 * transformation, see {@link isMemoizable}) remembering the numbers already
 * computed: a later call stops at the nearest numbered node. The tree is
 * walked with previousSibling/lastChild/parentNode only.
 */

"use strict";

import { isParserArtifact } from "../xpath/axes.js";

/** Node types that participate in `xsl:number` counting. */
const COUNTABLE_NODE_TYPES = new Set([1, 3, 4, 7, 8]);

/**
 * Whether a node takes part in counting: an element, text, processing
 * instruction or comment of the data model (not a parser artifact, see
 * axes.js).
 *
 * @param {Node} node - Any node
 * @returns {boolean} True for countable nodes
 */
function isCountable(node) {
  return COUNTABLE_NODE_TYPES.has(node.nodeType) && !isParserArtifact(node);
}

/**
 * The XPath node kind of a DOM node: CDATA sections are text nodes.
 *
 * @param {Node} node - Any node
 * @returns {number} The DOM node type, 3 for CDATA sections
 */
function nodeKind(node) {
  return node.nodeType === 4 ? 3 : node.nodeType;
}

/**
 * Default `count` pattern: nodes of the same kind as the numbered node and,
 * for elements and attributes, the same expanded name; for processing
 * instructions, the same target.
 *
 * @param {Node} candidate - The node being considered
 * @param {Node} node - The node `xsl:number` is numbering
 * @returns {boolean} True when the candidate is counted
 */
function matchesDefaultCount(candidate, node) {
  if (nodeKind(candidate) !== nodeKind(node)) return false;
  switch (node.nodeType) {
    case 1:
    case 2:
      return (
        candidate.localName === node.localName &&
        (candidate.namespaceURI ?? null) === (node.namespaceURI ?? null)
      );
    case 7:
      return candidate.target === node.target;
    default:
      return true;
  }
}

/**
 * Key telling apart the node kinds the default `count` pattern selects, so
 * memoized numbers are only reused for the same kind.
 *
 * @param {Node} node - The numbered node
 * @returns {string} e.g. `1|urn:x|item`
 */
function defaultCountKey(node) {
  if (node.nodeType === 7) return `7|${node.target}`;
  if (node.nodeType === 1 || node.nodeType === 2) {
    return `${node.nodeType}|${node.namespaceURI ?? ""}|${node.localName}`;
  }
  return String(nodeKind(node));
}

/**
 * Whether the numbers of an instruction may be memoized: its patterns must
 * not depend on variables or on the current node, whose values may differ
 * between invocations of the same instruction.
 *
 * @param {string|null} count - The `count` pattern
 * @param {string|null} from - The `from` pattern
 * @returns {boolean} True when counting only depends on the source tree
 *
 * @example
 * isMemoizable("item", null);        // true
 * isMemoizable("item[@k=$k]", null); // false
 */
export function isMemoizable(count, from) {
  return !/\$|current\s*\(/.test(`${count ?? ""} ${from ?? ""}`);
}

/**
 * Count a node's preceding siblings satisfying the predicate, stopping at the
 * nearest one whose position is memoized.
 *
 * @param {Node} node - The (counted) node whose position is computed
 * @param {(candidate: Node) => boolean} isCounted - Counting predicate
 * @param {WeakMap<Node, number>|null} positions - Memoized positions
 * @returns {number} The 1-based position
 */
function siblingPosition(node, isCounted, positions) {
  const own = positions?.get(node);
  if (own !== undefined) return own;

  let position = 1;
  for (let sibling = node.previousSibling; sibling;) {
    const known = positions?.get(sibling);
    if (known !== undefined) {
      position += known;
      break;
    }
    if (isCountable(sibling) && isCounted(sibling)) {
      position++;
    }
    sibling = sibling.previousSibling;
  }
  positions?.set(node, position);
  return position;
}

/**
 * Whether a node hangs off an element without being its child: an
 * attribute or a namespace node, whose parent is `ownerElement`.
 *
 * @param {Node} node - Any node
 * @returns {boolean} True for attribute and namespace nodes
 */
function isAttachedNode(node) {
  return node.nodeType === 2 || node.nodeType === 13;
}

/**
 * The node before another one in document order (its preceding node or its
 * parent).
 *
 * @param {Node} node - A child node
 * @returns {Node|null} The previous node, null at the root
 */
function previousInDocumentOrder(node) {
  let previous = node.previousSibling;
  if (!previous) return node.parentNode;
  while (previous.lastChild) previous = previous.lastChild;
  return previous;
}

/**
 * Count the ancestors-or-self of a node according to `level="single"` or
 * `level="multiple"`.
 *
 * @param {Node} node - The node being numbered
 * @param {boolean} multiple - Whether every counted ancestor is numbered
 * @param {(candidate: Node) => boolean} isCounted - Counting predicate
 * @param {(candidate: Node) => boolean} isFrom - Boundary predicate
 * @param {WeakMap<Node, number>|null} positions - Memoized positions
 * @returns {number[]} Numbers from the outermost ancestor inwards
 */
function countAncestors(node, multiple, isCounted, isFrom, positions) {
  const numbers = [];
  let current = node;

  while (current && current.nodeType !== 9) {
    if (isFrom(current)) break;
    if (isCounted(current)) {
      numbers.unshift(siblingPosition(current, isCounted, positions));
      if (!multiple) break;
    }
    current = isAttachedNode(current)
      ? current.ownerElement
      : current.parentNode;
  }

  return numbers;
}

/**
 * Count a node according to `level="any"`: walk backwards in document order
 * until a `from` node, the root, or a node whose total is memoized. An
 * attribute or namespace node counts itself, then its element and the nodes
 * before it: other attributes are neither preceding nor ancestor nodes (as
 * in libxslt).
 *
 * @param {Node} node - The node being numbered
 * @param {(candidate: Node) => boolean} isCounted - Counting predicate
 * @param {(candidate: Node) => boolean} isFrom - Boundary predicate
 * @param {WeakMap<Node, number>|null} totals - Memoized totals
 * @returns {number[]} A single number, or an empty list when nothing matches
 */
function countAny(node, isCounted, isFrom, totals) {
  let total = 0;
  let current = node;
  if (isAttachedNode(node)) {
    if (isFrom(node)) return [];
    if (isCounted(node)) total++;
    current = node.ownerElement;
  }

  while (current && current.nodeType !== 9) {
    const known = totals?.get(current);
    if (known !== undefined) {
      total += known;
      break;
    }
    if (isCountable(current)) {
      if (isFrom(current)) break;
      if (isCounted(current)) total++;
    }
    current = previousInDocumentOrder(current);
  }

  totals?.set(node, total);
  return total > 0 ? [total] : [];
}

/**
 * The memo tables of one kind of counted node.
 *
 * @param {Map<string, {positions: WeakMap, totals: WeakMap}>|null} memo - The instruction's memo
 * @param {string} key - The counted kind
 * @returns {{positions: WeakMap, totals: WeakMap}|null} The tables, null without memo
 */
function memoTables(memo, key) {
  if (!memo) return null;
  let tables = memo.get(key);
  if (!tables) {
    tables = { positions: new WeakMap(), totals: new WeakMap() };
    memo.set(key, tables);
  }
  return tables;
}

/**
 * Compute the number sequence for an `xsl:number` instruction.
 *
 * @param {Node} node - The current node
 * @param {{level?: string, count?: string|null, from?: string|null}} options - Instruction attributes
 * @param {(node: Node, pattern: string) => boolean} matcher - XSLT pattern matcher
 * @param {Map|null} [memo] - Memo of the instruction for the current
 *   transformation (a Map owned by the caller), or null to count from scratch
 * @returns {number[]} The computed numbers, outermost first
 *
 * @example
 * countXsltNumber(item, { level: 'any' }, matcher); // [2]
 */
export function countXsltNumber(node, options, matcher, memo = null) {
  const { level = "single", count = null, from = null } = options;
  const isCounted = count
    ? (candidate) => matcher(candidate, count)
    : (candidate) => matchesDefaultCount(candidate, node);
  const isFrom = from ? (candidate) => matcher(candidate, from) : () => false;
  const tables = memoTables(memo, count ? "" : defaultCountKey(node));

  if (level === "any") {
    return countAny(node, isCounted, isFrom, tables?.totals ?? null);
  }
  return countAncestors(
    node,
    level === "multiple",
    isCounted,
    isFrom,
    tables?.positions ?? null,
  );
}
