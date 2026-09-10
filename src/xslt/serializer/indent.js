/**
 * Indentation Rules
 *
 * Decides which elements may be pretty printed when `indent="yes"` is set.
 * Only element-only content is indented; mixed content is left untouched so
 * that the transformation result stays character-for-character faithful.
 */

import { NODE_TYPE } from "./constants.js";

/**
 * Test whether a character data node holds only whitespace.
 *
 * @param {Node} node - Text node to test
 * @returns {boolean} True when the node contains no non-whitespace character
 */
export function isWhitespaceOnlyText(node) {
  return !/\S/.test(node.nodeValue || "");
}

/**
 * Collect the children to write when indenting an element.
 *
 * @param {Element} element - Element whose children are inspected
 * @returns {Node[]|null} Children to indent, or null when the element must be
 *   serialized without any added whitespace
 */
export function getIndentableChildren(element) {
  const indentable = [];

  for (const child of element.childNodes) {
    if (child.nodeType === NODE_TYPE.TEXT) {
      if (isWhitespaceOnlyText(child)) {
        continue;
      }
      return null;
    }

    if (
      child.nodeType !== NODE_TYPE.ELEMENT &&
      child.nodeType !== NODE_TYPE.COMMENT &&
      child.nodeType !== NODE_TYPE.PROCESSING_INSTRUCTION
    ) {
      return null;
    }

    indentable.push(child);
  }

  return indentable.length > 0 ? indentable : null;
}
