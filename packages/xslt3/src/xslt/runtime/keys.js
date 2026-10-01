/**
 * Keys (XSLT 3.0 section 20.2): for each xsl:key name and document, an
 * index from key values to the nodes that match the key's pattern, built
 * on the first key() call for that document.
 *
 * @module @tradik/xslt3/xslt/runtime/keys
 */

import { getCollation } from "../../functions/collations.js";
import { stringItem } from "../../xpath/eval/atomics.js";
import { attributesOf } from "../../xpath/eval/domNodes.js";
import { atomize } from "../../xdm/nodes.js";
import { canonicalString } from "../../xdm/lexical.js";
import { xsltError } from "../names.js";
import { patternMatches } from "../patterns/compile.js";
import { comparisonKey, NAN_KEY } from "./atomicKeys.js";
import { derive, evaluate } from "./context.js";
import { bodySequence } from "./values.js";

/**
 * The index string of a key value.
 * @param {*} value - Atomic value
 * @param {object} definition - Key definition (collation, compatible)
 * @returns {string}
 */
export function keyValueString(value, definition) {
  const atomic = definition.compatible
    ? stringItem(canonicalString(value))
    : value;
  const collation = definition.collation
    ? getCollation(definition.collation)
    : null;
  return comparisonKey(atomic, collation);
}

/**
 * All nodes of a tree in document order (elements, attributes, text...).
 * @param {Node} root
 * @returns {Node[]}
 */
function treeNodes(root) {
  const nodes = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    nodes.push(node);
    if (node.nodeType === 1) nodes.push(...attributesOf(node));
    const children = node.childNodes ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].nodeType !== 10) stack.push(children[i]);
    }
  }
  return nodes;
}

/**
 * Builds the index of a key for a tree.
 * @param {object[]} definitions - The xsl:key declarations of the name
 * @param {Node} root
 * @param {object} xc
 * @returns {Map<string, Node[]>}
 */
function buildIndex(definitions, root, xc) {
  const index = new Map();
  const machine = xc.tx.machine;
  for (const node of treeNodes(root)) {
    for (const definition of definitions) {
      const nodeXc = derive(xc, { item: node, position: 1, size: 1 });
      if (!patternMatches(definition.match, node, nodeXc)) continue;
      const values = definition.use
        ? evaluate(definition.use, nodeXc)
        : bodySequence(definition.body, nodeXc, machine);
      for (const value of atomize(values)) {
        const key = keyValueString(value, definition);
        // NaN is not equal to itself: it finds nothing
        if (key === NAN_KEY) continue;
        let list = index.get(key);
        if (!list) index.set(key, (list = []));
        if (list.at(-1) !== node) list.push(node);
      }
    }
  }
  return index;
}

/**
 * Looks up nodes by key.
 * @param {object} xc - Context of the call
 * @param {string} name - Clark name of the key
 * @param {Array} values - Atomic values sought
 * @param {Node} root - Root of the tree searched
 * @returns {Node[]} nodes in document order
 */
export function keyLookup(xc, name, values, root) {
  const { tx } = xc;
  const definitions = tx.stylesheet.keys.get(name);
  if (!definitions) throw xsltError("XTDE1260", `No key named ${name}`);
  let byRoot = tx.keyIndexes.get(name);
  if (!byRoot) tx.keyIndexes.set(name, (byRoot = new Map()));
  let index = byRoot.get(root);
  if (index === "building") {
    throw xsltError("XTDE0640", `The key ${name} depends on itself`);
  }
  if (!index) {
    byRoot.set(root, "building");
    const base = derive(xc, { env: tx.globalEnv, rule: null, temporary: true });
    try {
      index = buildIndex(definitions, root, base);
    } finally {
      byRoot.delete(root);
    }
    byRoot.set(root, index);
  }
  const found = new Set();
  for (const value of values) {
    for (const node of index.get(keyValueString(value, definitions[0])) ?? []) {
      found.add(node);
    }
  }
  return tx.dyn.order.sort([...found]);
}
