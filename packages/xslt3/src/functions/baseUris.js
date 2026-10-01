/**
 * Base URIs of document nodes that differ from their document URI: the
 * documents of fn:parse-xml and fn:parse-xml-fragment have the static
 * base URI as base URI and no document URI.
 *
 * @module @tradik/xslt3/functions/baseUris
 */

/** @type {WeakMap<object, string>} */
const baseUris = new WeakMap();

/**
 * Records the base URI of a document node.
 * @param {Node} node
 * @param {string|undefined} uri - Nothing is recorded when undefined
 * @returns {Node} the node
 */
export function setBaseUri(node, uri) {
  if (uri !== undefined) baseUris.set(node, uri);
  return node;
}

/**
 * @param {Node} node
 * @returns {string|undefined} the base URI recorded for the node
 */
export const recordedBaseUri = (node) => baseUris.get(node);
