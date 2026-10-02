/**
 * Results of a transformation (XSLT 3.0 section 2.3.6, build-tree in
 * Serialization 3.1 section 3): a result whose serialization parameters
 * have build-tree "no" (the default of the json and adaptive methods) is
 * the raw sequence the sequence constructor delivers, so that maps,
 * arrays and atomic values reach the serializer as they are. Otherwise a
 * result tree is built from it by sequence normalization: with an
 * item-separator, the separator goes between all items.
 *
 * @module @tradik/xslt3/xslt/runtime/rawResults
 */

import { normalizeSequence } from "../../serialize/sequence.js";
import { SequenceReceiver } from "./sequenceReceiver.js";
import { TreeReceiver } from "./treeReceiver.js";

/** Methods whose results are raw unless build-tree says otherwise. */
const RAW_METHODS = new Set(["json", "adaptive"]);

/**
 * Whether a result with these serialization parameters is a tree.
 * @param {object} [output] - Serialization parameters (spec names)
 * @returns {boolean}
 */
export function buildsTree(output) {
  const value = output?.["build-tree"];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^\s*(yes|true|1)\s*$/.test(value);
  return !RAW_METHODS.has(output?.method);
}

/**
 * A result tree from a raw sequence, normalized with an item separator.
 * Nodes are copied, as the sequence may hold nodes of other trees.
 * @param {Array} items
 * @param {string} separator
 * @param {DocumentFragment} fragment - Receives the tree
 * @returns {DocumentFragment}
 */
function normalizedTree(items, separator, fragment) {
  const document = fragment.ownerDocument;
  for (const entry of normalizeSequence(items, separator)) {
    fragment.appendChild(
      typeof entry === "string"
        ? document.createTextNode(entry)
        : document.importNode(entry, true),
    );
  }
  return fragment;
}

/**
 * The receiver of a result: a tree under a new document fragment, or a
 * sequence for a raw result.
 * @param {object} output - Serialization parameters
 * @param {() => Document} owner - Owner document of the result's nodes
 * @param {boolean} [buildTree] - Overrides build-tree (the `buildTree`
 *   option of the transformation)
 * @returns {{receiver: object, value: () => (DocumentFragment|Array)}}
 *   the receiver and, once the result is complete, the fragment or the
 *   sequence
 */
export function resultReceiver(output, owner, buildTree) {
  const separator = output?.["item-separator"];
  const tree = buildTree ?? buildsTree(output);
  if (!tree || separator !== undefined) {
    const receiver = new SequenceReceiver(owner);
    const value = tree
      ? () =>
          normalizedTree(
            receiver.items,
            separator,
            owner().createDocumentFragment(),
          )
      : () => receiver.items;
    return { receiver, value };
  }
  const fragment = owner().createDocumentFragment();
  const receiver = new TreeReceiver(fragment, new Map());
  receiver.resultTree = true;
  return { receiver, value: () => fragment };
}
