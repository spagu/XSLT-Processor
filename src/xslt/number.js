/**
 * `xsl:number` counting and number-to-string conversion.
 *
 * Counting is kept independent from the engine: callers pass a `matcher`
 * callback that answers "does this node match this XSLT pattern", which keeps
 * this module free of any XPath dependency and easy to test in isolation.
 */

"use strict";

/** Node types that participate in `xsl:number` counting. */
const COUNTABLE_NODE_TYPES = new Set([1, 3, 4, 7, 8]);

/**
 * Default `count` pattern behaviour: match nodes of the same type and name.
 *
 * @param {Node} candidate - The node being considered
 * @param {Node} node - The node `xsl:number` is numbering
 * @returns {boolean} True when the candidate is of the same kind
 */
function matchesDefaultCount(candidate, node) {
  if (candidate.nodeType !== node.nodeType) return false;
  if (candidate.nodeType === 1) return candidate.nodeName === node.nodeName;
  return true;
}

/**
 * Build the predicate used to decide whether a node is counted.
 *
 * @param {Node} node - The node being numbered
 * @param {string|null} count - The `count` pattern, if any
 * @param {(node: Node, pattern: string) => boolean} matcher - Pattern matcher
 * @returns {(candidate: Node) => boolean} The predicate
 */
function createCountPredicate(node, count, matcher) {
  if (count) return (candidate) => matcher(candidate, count);
  return (candidate) => matchesDefaultCount(candidate, node);
}

/**
 * Build the predicate marking `from` boundaries.
 *
 * @param {string|null} from - The `from` pattern, if any
 * @param {(node: Node, pattern: string) => boolean} matcher - Pattern matcher
 * @returns {(candidate: Node) => boolean} The predicate, always false without `from`
 */
function createFromPredicate(from, matcher) {
  if (!from) return () => false;
  return (candidate) => matcher(candidate, from);
}

/**
 * Count preceding siblings of a node that satisfy the predicate.
 *
 * @param {Node} node - The node whose position is computed
 * @param {(candidate: Node) => boolean} isCounted - Counting predicate
 * @returns {number} The 1-based position
 */
function siblingPosition(node, isCounted) {
  let position = 1;
  let sibling = node.previousSibling;
  while (sibling) {
    if (COUNTABLE_NODE_TYPES.has(sibling.nodeType) && isCounted(sibling)) {
      position++;
    }
    sibling = sibling.previousSibling;
  }
  return position;
}

/**
 * Collect nodes in document order up to and including a target node.
 *
 * @param {Node} target - The node at which traversal stops
 * @returns {Node[]} Nodes in document order, ending with the target
 */
function nodesUpToTarget(target) {
  const root = target.ownerDocument || target;
  const result = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    result.push(current);
    if (current === target) break;
    const children = current.childNodes;
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
  }

  return result;
}

/**
 * Count a node according to `level="single"`.
 *
 * @param {Node} node - The node being numbered
 * @param {(candidate: Node) => boolean} isCounted - Counting predicate
 * @param {(candidate: Node) => boolean} isFrom - Boundary predicate
 * @returns {number[]} A single number, or an empty list when nothing matches
 */
function countSingle(node, isCounted, isFrom) {
  let current = node;
  while (current && current.nodeType !== 9) {
    if (isFrom(current)) return [];
    if (isCounted(current)) return [siblingPosition(current, isCounted)];
    current = current.parentNode;
  }
  return [];
}

/**
 * Count a node according to `level="multiple"`.
 *
 * @param {Node} node - The node being numbered
 * @param {(candidate: Node) => boolean} isCounted - Counting predicate
 * @param {(candidate: Node) => boolean} isFrom - Boundary predicate
 * @returns {number[]} Numbers from the outermost ancestor inwards
 */
function countMultiple(node, isCounted, isFrom) {
  const numbers = [];
  let current = node;

  while (current && current.nodeType !== 9) {
    if (isFrom(current)) break;
    if (isCounted(current)) {
      numbers.unshift(siblingPosition(current, isCounted));
    }
    current = current.parentNode;
  }

  return numbers;
}

/**
 * Count a node according to `level="any"`.
 *
 * @param {Node} node - The node being numbered
 * @param {(candidate: Node) => boolean} isCounted - Counting predicate
 * @param {(candidate: Node) => boolean} isFrom - Boundary predicate
 * @returns {number[]} A single number, or an empty list when nothing matches
 */
function countAny(node, isCounted, isFrom) {
  let total = 0;

  for (const candidate of nodesUpToTarget(node)) {
    if (!COUNTABLE_NODE_TYPES.has(candidate.nodeType)) continue;
    if (isFrom(candidate)) {
      total = 0;
      continue;
    }
    if (isCounted(candidate)) total++;
  }

  return total > 0 ? [total] : [];
}

/**
 * Compute the number sequence for an `xsl:number` instruction.
 *
 * @param {Node} node - The current node
 * @param {{level?: string, count?: string|null, from?: string|null}} options - Instruction attributes
 * @param {(node: Node, pattern: string) => boolean} matcher - XSLT pattern matcher
 * @returns {number[]} The computed numbers, outermost first
 *
 * @example
 * countXsltNumber(item, { level: 'any' }, matcher); // [2]
 */
export function countXsltNumber(node, options, matcher) {
  const { level = "single", count = null, from = null } = options;
  const isCounted = createCountPredicate(node, count, matcher);
  const isFrom = createFromPredicate(from, matcher);

  if (level === "any") return countAny(node, isCounted, isFrom);
  if (level === "multiple") return countMultiple(node, isCounted, isFrom);
  return countSingle(node, isCounted, isFrom);
}
