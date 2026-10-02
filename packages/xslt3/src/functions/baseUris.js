/**
 * Base URIs of nodes: the base URI recorded for document nodes that
 * differ from their document URI (the documents of fn:parse-xml and
 * fn:parse-xml-fragment have the static base URI as base URI and no
 * document URI) and for constructed nodes, and the base URI of any node
 * from these and xml:base attributes.
 *
 * @module @tradik/xslt3/functions/baseUris
 */

import { parentOf } from "../xpath/eval/domNodes.js";
import { XML_NAMESPACE } from "../xpath/eval/namespaceNodes.js";
import { resolveUri } from "../xpath/eval/uris.js";
import { resolveUri as resolveReference } from "./uri.js";

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

/**
 * An xml:base attribute resolved against the base URI of the parent
 * (RFC 3986: an absolute URI stays as written).
 * @param {string} value
 * @param {string|undefined} base
 * @returns {string}
 */
function resolveBase(value, base) {
  try {
    return base === undefined ? value : resolveReference(value, base);
  } catch {
    return resolveUri(value, base);
  }
}

/**
 * Base URI of a node: its xml:base attributes resolved against the
 * document URI, or against the base URI recorded for a constructed node.
 * Namespace nodes have none (XDM 3.1 section 6.6.2).
 * @param {Node} node
 * @returns {string|undefined}
 */
export function nodeBaseUri(node) {
  if (node.nodeType === 13) return undefined;
  const chain = [];
  for (let n = node; n; n = parentOf(n)) chain.unshift(n);
  let base;
  for (const n of chain) {
    const own =
      recordedBaseUri(n) ??
      (n.nodeType === 9 || n.nodeType === 11 ? documentUriOf(n) : undefined);
    if (own !== undefined) base = own;
    if (n.nodeType === 1 && n.hasAttributeNS(XML_NAMESPACE, "base")) {
      base = resolveBase(n.getAttributeNS(XML_NAMESPACE, "base"), base);
    }
  }
  return base;
}

/**
 * @param {Node} node - A document node
 * @returns {string|undefined} its URI, undefined when unknown
 */
export function documentUriOf(node) {
  const uri = node.documentURI ?? node.URL;
  return uri && uri !== "about:blank" ? uri : undefined;
}
