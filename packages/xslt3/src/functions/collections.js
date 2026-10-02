/**
 * fn:collection and fn:uri-collection (F&O 3.1 sections 14.6.6 and
 * 14.6.7), through the dynamic context hook `collection` (see
 * xpath/eval/resources.js), and fn:collation-key (section 5.3.6).
 *
 * @module @tradik/xslt3/functions/collections
 */

import { XPathError } from "../errors.js";
import { AtomicValue, isNode } from "../xdm/atomic.js";
import { types } from "../xdm/types.js";
import { collationArg } from "./collations.js";
import { define } from "./support.js";

const encoder = new globalThis.TextEncoder();

/**
 * The items of a collection.
 * @param {Array|undefined} uri - The optional argument
 * @param {object} context
 * @returns {Array}
 */
const items = (uri, context) => context.collection(uri?.[0]?.value ?? null);

/**
 * The URIs of a collection: document URIs of its document nodes, atomic
 * items (xs:anyURI) as they are; other nodes have no URI.
 * @param {Array|undefined} uri
 * @param {object} context
 * @returns {Array} xs:anyURI values
 */
function uris(uri, context) {
  const result = [];
  for (const item of items(uri, context)) {
    const text = isNode(item)
      ? item.nodeType === 9 && item.documentURI
      : item.value;
    if (text) result.push(new AtomicValue(types.anyURI, text));
  }
  return result;
}

/**
 * fn:collation-key: the UTF-8 bytes of the collation key of a string,
 * which order as the collation does (UTF-8 keeps the codepoint order).
 * @param {string} text
 * @param {import("./collations.js").Collation} collation
 * @returns {AtomicValue} an xs:base64Binary
 * @throws {XPathError} FOCH0002 for the UCA collations, whose keys
 *   Intl.Collator does not expose
 */
function collationKey(text, collation) {
  if (!collation.key) {
    throw new XPathError(
      "FOCH0002",
      `No collation keys for the collation ${collation.uri}`,
    );
  }
  return new AtomicValue(
    types.base64Binary,
    encoder.encode(collation.key(text)),
  );
}

/** Function definitions. */
export const collectionFunctions = [
  define("collection", [], "item()*", (_, c) => items(undefined, c)),
  define("collection", ["xs:string?"], "item()*", ([uri], c) => items(uri, c)),
  define("uri-collection", [], "xs:anyURI*", (_, c) => uris(undefined, c)),
  define("uri-collection", ["xs:string?"], "xs:anyURI*", ([uri], c) =>
    uris(uri, c),
  ),
  define("collation-key", ["xs:string"], "xs:base64Binary", ([[key]], c) => [
    collationKey(key.value, collationArg(undefined, c)),
  ]),
  define(
    "collation-key",
    ["xs:string", "xs:string"],
    "xs:base64Binary",
    ([[key], collation], c) => [
      collationKey(key.value, collationArg(collation, c)),
    ],
  ),
];
