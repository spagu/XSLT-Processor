/**
 * Deep copies of nodes into a receiver (xsl:copy-of, nodes added to
 * element content), with or without their namespace nodes. Iterative, so
 * deep trees do not exhaust the call stack.
 *
 * @module @tradik/xslt3/xslt/runtime/copy
 */

import {
  attributesOf,
  isNamespaceDeclaration,
} from "../../xpath/eval/domNodes.js";
import { inScopeNamespaces } from "../../xpath/eval/namespaceNodes.js";

/**
 * Copies the namespace nodes of an element into a receiver.
 * @param {Element} element
 * @param {object} receiver
 */
export function copyNamespaceNodes(element, receiver) {
  for (const [prefix, uri] of inScopeNamespaces(element)) {
    if (prefix !== "xml" && uri !== "") receiver.namespace(prefix, uri);
  }
}

/**
 * Starts the copy of an element: its name, namespaces and attributes.
 * @param {Element} element
 * @param {object} receiver
 * @param {boolean} copyNamespaces
 * @param {boolean} [top] - The element is the root of the copy (its
 *   inherited namespaces are copied too)
 * @returns {object} the receiver of the element's content
 */
export function startElementCopy(
  element,
  receiver,
  copyNamespaces,
  top = true,
) {
  const content = receiver.element(
    element.namespaceURI ?? "",
    element.nodeName,
  );
  if (copyNamespaces && top) copyNamespaceNodes(element, content);
  else if (copyNamespaces) {
    for (const attribute of element.attributes) {
      if (!isNamespaceDeclaration(attribute)) continue;
      const name = attribute.name;
      content.namespace(name === "xmlns" ? "" : name.slice(6), attribute.value);
    }
  }
  for (const attribute of attributesOf(element)) {
    content.attribute(
      attribute.namespaceURI ?? "",
      attribute.nodeName,
      attribute.value,
    );
  }
  return content;
}

/**
 * Copies a node that is not an element or document.
 * @param {Node} node
 * @param {object} receiver
 */
export function copyLeaf(node, receiver) {
  switch (node.nodeType) {
    case 2:
      receiver.attribute(node.namespaceURI ?? "", node.nodeName, node.value);
      break;
    case 3:
    case 4:
      receiver.text(node.nodeValue);
      break;
    case 7:
      receiver.pi(node.target ?? node.nodeName, node.nodeValue);
      break;
    case 8:
      receiver.comment(node.nodeValue);
      break;
    default:
      // a namespace node
      receiver.namespace(node.localName, node.nodeValue);
  }
}

/**
 * Copies a node with its descendants into a receiver; a document node
 * contributes its children.
 * @param {Node} node
 * @param {object} receiver - Tree or sequence receiver
 * @param {boolean} copyNamespaces - Copy the namespace nodes of elements
 */
export function copyNode(node, receiver, copyNamespaces) {
  const stack = [[node, receiver]];
  while (stack.length > 0) {
    const [current, target] = stack.pop();
    const type = current.nodeType;
    let content;
    if (type === 1) {
      content = startElementCopy(
        current,
        target,
        copyNamespaces,
        current === node,
      );
    } else if (type === 9 || type === 11) {
      content = target.document();
    } else {
      copyLeaf(current, target);
      continue;
    }
    const children = current.childNodes;
    for (let i = children.length - 1; i >= 0; i--) {
      if (children[i].nodeType !== 10) stack.push([children[i], content]);
    }
  }
}
