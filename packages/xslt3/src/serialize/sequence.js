/**
 * Sequence normalization (Serialization 3.1 section 2), done by the xml,
 * xhtml, html and text methods before they write anything: arrays are
 * flattened, atomic values become strings (joined by a space, or by the
 * item-separator between all items), document nodes are replaced by their
 * children and adjacent text is merged.
 *
 * The result is the list of the children of the normalized document:
 * strings for text nodes and DOM nodes for elements, comments and
 * processing instructions.
 *
 * @module @tradik/xslt3/serialize/sequence
 */

import { XPathError } from "../errors.js";
import { canonicalString, itemKind } from "../xdm/index.js";

const ATTRIBUTE_NODE = 2;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const DOCUMENT_NODE = 9;
const DOCUMENT_TYPE_NODE = 10;
const DOCUMENT_FRAGMENT_NODE = 11;
const NAMESPACE_NODE = 13;

/**
 * Flattens arrays, without recursion.
 * @param {Array} sequence
 * @returns {Array} the items, arrays replaced by their members' items
 */
export function flattenArrays(sequence) {
  const result = [];
  const pending = [[sequence, 0]];
  while (pending.length) {
    const top = pending[pending.length - 1];
    if (top[1] === top[0].length) {
      pending.pop();
      continue;
    }
    const item = top[0][top[1]++];
    if (itemKind(item) === "array") pending.push([item.members.flat(), 0]);
    else result.push(item);
  }
  return result;
}

/**
 * Appends a node, or the children of a document node, merging text.
 * @param {Array<string|Node>} out
 * @param {Node} node
 */
function appendNode(out, node) {
  const type = node.nodeType;
  if (type === DOCUMENT_NODE || type === DOCUMENT_FRAGMENT_NODE) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== DOCUMENT_TYPE_NODE) appendNode(out, child);
    }
  } else if (type === TEXT_NODE || type === CDATA_SECTION_NODE) {
    appendText(out, node.nodeValue);
  } else if (type === ATTRIBUTE_NODE || type === NAMESPACE_NODE) {
    throw new XPathError(
      "SENR0001",
      "An attribute or namespace node cannot be serialized on its own",
    );
  } else {
    out.push(node);
  }
}

/**
 * Appends text, merging it with preceding text.
 * @param {Array<string|Node>} out
 * @param {string} text
 */
function appendText(out, text) {
  if (text === "") return;
  const last = out.length - 1;
  if (typeof out[last] === "string") out[last] += text;
  else out.push(text);
}

/**
 * Normalizes a sequence.
 * @param {Array} sequence - XDM items
 * @param {string} [itemSeparator] - Separator between all items; when
 *   absent, adjacent atomic values are separated by a space
 * @returns {Array<string|Node>} the content of the normalized document
 * @throws {XPathError} SENR0001 for attribute and namespace nodes, maps
 *   and function items
 */
export function normalizeSequence(sequence, itemSeparator) {
  const out = [];
  let previousAtomic = false;
  flattenArrays(sequence).forEach((item, index) => {
    const kind = itemKind(item);
    if (itemSeparator !== undefined && index > 0) {
      appendText(out, itemSeparator);
    }
    if (kind === "atomic") {
      const separator =
        previousAtomic && itemSeparator === undefined ? " " : "";
      appendText(out, separator + canonicalString(item));
    } else if (kind === "node") {
      appendNode(out, item);
    } else {
      throw new XPathError("SENR0001", `A ${kind} cannot be serialized`);
    }
    previousAtomic = kind === "atomic";
  });
  return out;
}
