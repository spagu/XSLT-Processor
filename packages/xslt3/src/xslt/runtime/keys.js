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
import { namespaceNodesOf } from "../../xpath/eval/namespaceNodes.js";
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
 * The index strings of the key values of a node, or of the values sought:
 * one per value, or one for the whole sequence of a composite key (XSLT
 * 3.0 section 20.2.2), which matches only an equal sequence.
 * @param {Array} values - Atomic values
 * @param {object} definition - Key definition
 * @returns {string[]}
 */
function indexKeys(values, definition) {
  const keys = values.map((value) => keyValueString(value, definition));
  if (!definition.composite) return keys;
  return keys.includes(NAN_KEY) ? [NAN_KEY] : [JSON.stringify(keys)];
}

/**
 * All nodes of a tree in document order (elements, attributes, text...).
 * @param {Node} root
 * @param {boolean} namespaces - Include the namespace nodes
 * @returns {Node[]}
 */
function treeNodes(root, namespaces) {
  const nodes = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    nodes.push(node);
    if (node.nodeType === 1) {
      if (namespaces) nodes.push(...namespaceNodesOf(node));
      nodes.push(...attributesOf(node));
    }
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
  const namespaces = definitions.some((definition) => definition.namespaces);
  for (const node of treeNodes(root, namespaces)) {
    for (const definition of definitions) {
      const nodeXc = derive(xc, { item: node, position: 1, size: 1 });
      if (!patternMatches(definition.match, node, nodeXc)) continue;
      const values = definition.use
        ? evaluate(definition.use, nodeXc)
        : bodySequence(definition.body, nodeXc, machine);
      for (const key of indexKeys(atomize(values), definition)) {
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
 * @param {object} [owner] - Package compiler of the call (default: the
 *   top-level package)
 * @returns {Node[]} nodes in document order
 */
export function keyLookup(xc, name, values, root, owner) {
  const { tx } = xc;
  // keys are local to the package of the call (XSLT 3.0 section 3.5.5)
  const definitions = (owner ?? tx.stylesheet).keys.get(name);
  if (!definitions) throw xsltError("XTDE1260", `No key named ${name}`);
  let byRoot = tx.keyIndexes.get(definitions);
  if (!byRoot) tx.keyIndexes.set(definitions, (byRoot = new Map()));
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
  for (const key of indexKeys(values, definitions[0])) {
    for (const node of index.get(key) ?? []) found.add(node);
  }
  return tx.dyn.order.sort([...found]);
}
