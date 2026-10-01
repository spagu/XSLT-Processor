/**
 * The text output method (Serialization 3.1 section 8): the string value
 * of the normalized document, that is its text nodes in document order,
 * without escaping. Character maps and Unicode normalization apply; a
 * character the encoding cannot represent is a SERE0008 error.
 *
 * @module @tradik/xslt3/serialize/methods/text
 */

import { Expander } from "../output/expander.js";

/**
 * Writes the text of the normalized sequence.
 * @param {Array<string|Node>} entries - From normalizeSequence
 * @param {import("../params/settings.js").Settings} settings
 * @param {import("../output/buffer.js").OutputBuffer} buffer
 * @yields {string} chunks of output, when the buffer is full
 * @returns {Generator<string, void, void>}
 */
export function* writeText(entries, settings, buffer) {
  const expander = new Expander(settings);
  for (const entry of entries) {
    if (typeof entry === "string") {
      buffer.write(expander.raw(entry));
    } else if (entry.nodeType === 1) {
      // descendant text nodes in document order, without recursion
      const stack = [entry.firstChild];
      while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        stack.push(node.nextSibling);
        const type = node.nodeType;
        if (type === 3 || type === 4) {
          buffer.write(expander.raw(node.nodeValue));
        } else if (type === 1) {
          stack.push(node.firstChild);
        }
        if (buffer.full) yield buffer.take();
      }
    }
    if (buffer.full) yield buffer.take();
  }
}
