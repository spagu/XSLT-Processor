/**
 * fn:snapshot of one node (XSLT 3.0 section 20.7): a deep copy of the
 * node inside copies of its ancestors. Each ancestor is copied with its
 * attributes and namespaces but without its other children, so the copy
 * keeps the node's root, parent, attributes and namespaces.
 *
 * @module @tradik/xslt3/xslt/runtime/snapshot
 */

import { namedAttributeOf, parentOf } from "../../xpath/eval/domNodes.js";
import { namespaceNodesOf } from "../../xpath/eval/namespaceNodes.js";
import { copyNode, startElementCopy } from "./copy.js";

/**
 * Copies the ancestors of a node, outermost first.
 * @param {Node[]} ancestors - Root first
 * @param {object} receiver - Sequence receiver that gets the root copy
 * @param {(copy: Node, original: Node) => void} record - Told of each copy
 * @returns {object} the tree receiver of the innermost copy's content
 */
function copyAncestors(ancestors, receiver, record) {
  const [root, ...rest] = ancestors;
  let content =
    root.nodeType === 1
      ? startElementCopy(root, receiver, true)
      : receiver.document();
  record(content.parent, root);
  for (const element of rest) {
    content = startElementCopy(element, content, true);
    record(content.parent, element);
  }
  return content;
}

/**
 * The snapshot of a node.
 * @param {Node} node
 * @param {object} receiver - Sequence receiver (items get the root copy)
 * @param {(copy: Node, original: Node) => void} record - Told of the
 *   copy of each ancestor (accumulator values are those of the originals)
 * @returns {Node} the copy of the node inside the copied tree
 */
export function snapshotNode(node, receiver, record) {
  const ancestors = [];
  for (let p = parentOf(node); p; p = parentOf(p)) ancestors.unshift(p);
  if (ancestors.length === 0) {
    copyNode(node, receiver, true);
    return receiver.items.at(-1);
  }
  const content = copyAncestors(ancestors, receiver, record);
  const parent = content.parent;
  if (node.nodeType === 2) {
    return namedAttributeOf(
      parent,
      node.namespaceURI ?? "",
      node.localName ?? node.nodeName,
    );
  }
  if (node.nodeType === 13) {
    return namespaceNodesOf(parent).find(
      (ns) => ns.localName === node.localName,
    );
  }
  copyNode(node, content, true);
  return parent.lastChild;
}
