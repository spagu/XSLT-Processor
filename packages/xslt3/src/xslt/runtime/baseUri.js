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
 * outermost element of its tree and that tree's document node has no
 * base URI of its own (a copied document keeps the original's, which its
 * new children inherit).
 * @param {{parent: Node}} content - Receiver of the element's content
 * @param {string|undefined} base - Static base URI of the instruction
 */
export function markConstructed(content, base) {
  const element = content.parent;
  const parent = element?.parentNode;
  if (parent?.nodeType === 1) return;
  if (parent && copiedDocuments.has(parent)) return;
  setBaseUri(element, base);
}

/** Document nodes made by copying a document. @type {WeakSet<Node>} */
const copiedDocuments = new WeakSet();

/**
 * Records, on the copy of an element at the top of its new tree, the base
 * URI its xml:base (copied too) applies to: the original's parent's. A
 * shallow copy (xsl:copy), without the xml:base attribute, takes the
 * original's own base URI. A copy attached to a new parent inherits.
 * @param {Element} original
 * @param {Element} copy
 * @param {boolean} [withAttributes] - The attributes were copied too
 */
export function markCopied(original, copy, withAttributes = true) {
  if (copy.parentNode) return;
  if (!withAttributes) {
    setBaseUri(copy, nodeBaseUri(original));
    return;
  }
  const parent = original.parentNode;
  setBaseUri(copy, parent ? nodeBaseUri(parent) : recordedBaseUri(original));
}

/**
 * Records, on the copy of a document node, the base URI of the original,
 * when the copy is a new document (not content added to a tree).
 * @param {Node} original - Document node
 * @param {{parent?: Node}} content - Receiver of the copy's content
 */
export function markDocumentCopied(original, content) {
  const copy = content.parent;
  if (copy && copy.nodeType !== 1 && !copy.parentNode) {
    setBaseUri(copy, nodeBaseUri(original));
    copiedDocuments.add(copy);
  }
}
