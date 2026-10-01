/**
 * Base URIs of constructed nodes (XSLT 3.0 sections 11.1.? and 9.4): a
 * temporary tree and the outermost element built by an instruction take
 * the static base URI of the instruction; a copied element keeps the base
 * URI of the original. Inner elements inherit theirs, adjusted by
 * xml:base attributes, when fn:base-uri() asks (functions/nodePaths.js).
 *
 * @module @tradik/xslt3/xslt/runtime/baseUri
 */

import { recordedBaseUri, setBaseUri } from "../../functions/baseUris.js";
import { nodeBaseUri } from "../../functions/nodePaths.js";

/**
 * Records the base URI of an element just built, when it is the
 * outermost element of its tree.
 * @param {{parent: Node}} content - Receiver of the element's content
 * @param {string|undefined} base - Static base URI of the instruction
 */
export function markConstructed(content, base) {
  const element = content.parent;
  if (element?.parentNode?.nodeType !== 1) setBaseUri(element, base);
}

/**
 * Records, on the copy of an element at the top of its new tree, the base
 * URI its xml:base (copied too) applies to: the original's parent's.
 * @param {Element} original
 * @param {Element} copy
 */
export function markCopied(original, copy) {
  if (copy.parentNode?.nodeType === 1) return;
  const parent = original.parentNode;
  setBaseUri(copy, parent ? nodeBaseUri(parent) : recordedBaseUri(original));
}
