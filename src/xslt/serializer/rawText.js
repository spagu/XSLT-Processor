/**
 * Raw Text Registry
 *
 * Tracks the text nodes produced with `disable-output-escaping="yes"`
 * (XSLT 1.0 section 16.4) so the serializers can emit them verbatim.
 */

/**
 * Text nodes whose content must be written without escaping.
 * @type {WeakSet<Node>}
 */
export const rawTextNodes = new WeakSet();

/**
 * Mark a text node as produced with `disable-output-escaping="yes"`.
 *
 * @param {Node|null} node - Text node to mark
 * @returns {Node|null} The same node, for chaining
 */
export function markRawText(node) {
  if (node) {
    rawTextNodes.add(node);
  }
  return node;
}

/**
 * Check whether a node must be serialized without output escaping.
 *
 * Both the registry and the legacy `_disableOutputEscaping` flag set by the
 * XSLT engine are honored so that either marking mechanism works.
 *
 * @param {Node|null} node - Node to test
 * @returns {boolean} True when the node content must be emitted raw
 */
export function isRawText(node) {
  if (!node) {
    return false;
  }
  return rawTextNodes.has(node) || node._disableOutputEscaping === true;
}
