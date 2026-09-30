/**
 * Text Output Serializer
 *
 * Implements the `text` output method of XSLT 1.0 section 16.3: the result is
 * the concatenation of every descendant character data node, unescaped.
 */

import { NODE_TYPE } from "./constants.js";
import { ChunkBuffer } from "./chunks.js";

/**
 * Whether a node is character data (text or CDATA section).
 *
 * @param {Node} node - Node to test
 * @returns {boolean} True for character data
 */
function isCharacterData(node) {
  return (
    node.nodeType === NODE_TYPE.TEXT ||
    node.nodeType === NODE_TYPE.CDATA_SECTION
  );
}

/**
 * The character data nodes under `root` in document order, found without
 * recursion (firstChild/nextSibling walk), so deep trees cannot overflow the
 * stack.
 *
 * @param {Node} root - Document, fragment, element or character data node
 * @yields {Node} Character data nodes
 * @returns {Generator<Node, void, void>} The nodes
 */
function* characterDataNodes(root) {
  let node = root;
  while (node) {
    if (isCharacterData(node)) yield node;
    if (node.firstChild) {
      node = node.firstChild;
      continue;
    }
    while (node !== root && !node.nextSibling) node = node.parentNode;
    node = node === root ? null : node.nextSibling;
  }
}

/**
 * Serialize a result tree with the text output method, in chunks.
 *
 * @param {Node} node - Document, fragment, element or character data node
 * @param {number} [chunkSize] - Chunk size in UTF-16 code units; Infinity
 *   yields the whole text as one chunk
 * @yields {string} Non-empty chunks of at most `chunkSize` code units
 * @returns {Generator<string, void, void>} The chunks, in order
 *
 * @example
 * [...textChunks(fragment, 16384)].join("");
 */
export function* textChunks(node, chunkSize) {
  const buffer = new ChunkBuffer(chunkSize);
  for (const text of characterDataNodes(node)) {
    buffer.write(text.nodeValue || "");
    if (buffer.full) yield* buffer.take();
  }
  yield* buffer.take(true);
}

/**
 * Serialize a result tree with the text output method.
 *
 * @param {Node} node - Document, fragment, element or character data node
 * @returns {string} Concatenated character data
 */
export function serializeText(node) {
  let text = "";
  for (const chunk of textChunks(node, Infinity)) text += chunk;
  return text;
}
