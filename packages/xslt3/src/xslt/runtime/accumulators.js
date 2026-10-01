/**
 * Accumulator values at run time (XSLT 3.0 sections 18.2.2 to 18.2.7):
 * computed for a whole tree the first time a value of the tree is asked
 * for, by a document-order traversal on an explicit stack, and cached
 * per tree. Which accumulators apply to a tree is recorded per root (the
 * source document: those of the initial mode; xsl:source-document: its
 * use-accumulators; any other tree: all of them).
 *
 * @module @tradik/xslt3/xslt/runtime/accumulators
 */

import { childrenOf, rootOf } from "../../xpath/eval/domNodes.js";
import { xsltError } from "../names.js";
import { patternMatches } from "../patterns/compile.js";
import { derive } from "./context.js";

/**
 * The accumulator state of a transformation, created on first use.
 * @param {object} tx
 * @returns {{scopes: WeakMap, values: WeakMap, origins: WeakMap}}
 */
function stateOf(tx) {
  tx.accumulatorState ??= {
    scopes: new WeakMap(),
    values: new WeakMap(),
    origins: new WeakMap(),
  };
  return tx.accumulatorState;
}

/**
 * Records which accumulators apply to a tree.
 * @param {object} tx
 * @param {Node} root - Root of the tree
 * @param {Set<string>|"all"} accumulators
 */
export function setApplicable(tx, root, accumulators) {
  stateOf(tx).scopes.set(root, accumulators);
}

/**
 * Records that the nodes of a copy take their accumulator values from
 * the nodes they were copied from.
 * @param {object} tx
 * @param {Node} copy
 * @param {Node} original
 */
export function setOrigin(tx, copy, original) {
  stateOf(tx).origins.set(copy, original);
}

/**
 * The new value of an accumulator at a traversal event.
 * @param {object} accumulator
 * @param {Node} node
 * @param {boolean} end - Phase
 * @param {Array} value - The old value
 * @param {object} xc - Context of the transformation
 * @returns {Array}
 */
function step(accumulator, node, end, value, xc) {
  const focus = derive(xc, { item: node, position: 1, size: 1 });
  let rule = null;
  for (const candidate of accumulator.rules) {
    if (
      candidate.end === end &&
      patternMatches(candidate.pattern, node, focus)
    ) {
      rule = candidate;
    }
  }
  if (!rule) return value;
  const env = { value, next: xc.tx.globalEnv };
  return rule.value(derive(focus, { env }), xc.tx.machine);
}

/**
 * Computes the values of an accumulator for every node of a tree.
 * @param {object} accumulator
 * @param {Node} root
 * @param {object} entry - Receives `before` and `after` (Maps by node)
 * @param {object} xc - Context of the transformation
 */
function traverse(accumulator, root, entry, xc) {
  let value;
  let failure = null;
  const apply = (compute) => {
    if (failure) return;
    try {
      value = compute();
    } catch (error) {
      failure = { error };
    }
  };
  apply(() =>
    accumulator.initial(derive(xc, { item: root, position: 1, size: 1 })),
  );
  const stack = [[root, false]];
  while (stack.length > 0) {
    const [node, closing] = stack.pop();
    apply(() => step(accumulator, node, closing, value, xc));
    (closing ? entry.after : entry.before).set(node, failure ?? { value });
    if (closing) continue;
    stack.push([node, true]);
    const children = childrenOf(node);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push([children[i], false]);
    }
  }
}

/**
 * The pre- or post-descent value of an accumulator at a node.
 * @param {object} xc - XSLT context
 * @param {string} key - Clark name of the accumulator
 * @param {Node} node
 * @param {boolean} after - Post-descent value
 * @returns {Array}
 */
export function accumulatorValue(xc, key, node, after) {
  const tx = xc.tx;
  const accumulator = tx.stylesheet.accumulators.get(key);
  const state = stateOf(tx);
  let target = node;
  while (state.origins.has(rootOf(target))) {
    target = originalNode(state.origins, target);
  }
  const root = rootOf(target);
  const scope = state.scopes.get(root) ?? "all";
  if (scope !== "all" && !scope.has(key)) {
    throw xsltError("XTDE3362", `The accumulator ${key} does not apply here`);
  }
  let byKey = state.values.get(root);
  if (!byKey) state.values.set(root, (byKey = new Map()));
  let entry = byKey.get(key);
  if (!entry) {
    entry = { before: new Map(), after: new Map(), done: false };
    byKey.set(key, entry);
    traverse(accumulator, root, entry, tx.globalContext);
    entry.done = true;
  }
  const result = (after ? entry.after : entry.before).get(target);
  if (!result) {
    throw xsltError("XTDE3400", `The accumulator ${key} depends on itself`);
  }
  if (result.error) throw result.error;
  return result.value;
}

/**
 * The node of the original tree a node of a copy stands for.
 * @param {WeakMap<Node, Node>} origins - Copy roots to original nodes
 * @param {Node} node - A node of a copy
 * @returns {Node}
 */
function originalNode(origins, node) {
  const path = [];
  let current = node;
  const root = rootOf(node);
  for (; current !== root; current = current.parentNode) {
    path.push([...current.parentNode.childNodes].indexOf(current));
  }
  let original = origins.get(root);
  for (let i = path.length - 1; i >= 0; i--) {
    original = original.childNodes[path[i]];
  }
  return original;
}

/**
 * Records the accumulators that apply to the trees of the global context
 * item (xsl:global-context-item, all by default) and of the initial match
 * selection (those of the initial mode, none by default).
 * @param {object} tx
 * @param {object} options - See CompiledStylesheet.transform
 * @param {*} source - The (stripped) source node
 */
export function setInitialAccumulators(tx, options, source) {
  const { stylesheet } = tx;
  const fromItems =
    options.initialTemplate === undefined && !options.initialFunction;
  const selection = fromItems
    ? [options.initialMatchSelection ?? source].flat()
    : [];
  const fromMode = tx.defaultMode.accumulators ?? new Set();
  for (const item of selection) {
    if (typeof item?.nodeType === "number") {
      setApplicable(tx, rootOf(item), fromMode);
    }
  }
  if (typeof source?.nodeType === "number" && !selection.includes(source)) {
    setApplicable(tx, rootOf(source), stylesheet.globalAccumulators);
  }
}
