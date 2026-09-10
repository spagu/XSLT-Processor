/**
 * Text Output Serializer
 *
 * Implements the `text` output method of XSLT 1.0 section 16.3: the result is
 * the concatenation of every descendant character data node, unescaped.
 */

import { NODE_TYPE } from "./constants.js";

/**
 * Serialize a result tree with the text output method.
 *
 * @param {Node} node - Document, fragment, element or character data node
 * @returns {string} Concatenated character data
 */
export function serializeText(node) {
  if (
    node.nodeType === NODE_TYPE.TEXT ||
    node.nodeType === NODE_TYPE.CDATA_SECTION
  ) {
    return node.nodeValue || "";
  }

  let text = "";
  for (const child of node.childNodes || []) {
    text += serializeText(child);
  }
  return text;
}
