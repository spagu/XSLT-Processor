/**
 * Accessors of the data model for any item: string value, typed value
 * (atomization) and effective boolean value.
 *
 * Nodes are DOM nodes of any implementation; only `nodeType`, `nodeValue`
 * and `childNodes` are read. Without a schema, elements, attributes, text
 * and document nodes have an xs:untypedAtomic typed value; comments,
 * processing instructions and namespace nodes an xs:string one.
 *
 * @module @tradik/xslt3/xdm/nodes
 */

import { XPathError } from "../errors.js";
import { AtomicValue, itemKind } from "./atomic.js";
import { canonicalString } from "./lexical.js";
import { types } from "./types.js";

const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;
/** nodeType used for XPath namespace nodes by DOM-based XPath engines. */
const NAMESPACE_NODE = 13;
const ELEMENT_NODE = 1;
const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;
const containers = new Set([
  ELEMENT_NODE,
  DOCUMENT_NODE,
  DOCUMENT_FRAGMENT_NODE,
]);

/**
 * Appends the text of the descendant text nodes of a node.
 * @param {Node} node
 * @param {string[]} parts
 */
function collectText(node, parts) {
  for (const child of node.childNodes) {
    if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_SECTION_NODE) {
      parts.push(child.nodeValue);
    } else if (child.nodeType === ELEMENT_NODE) {
      collectText(child, parts);
    }
  }
}

/**
 * String value of a node (dm:string-value): the concatenated descendant
 * text of elements and documents, the value of other nodes.
 * @param {Node} node
 * @returns {string}
 */
export function nodeStringValue(node) {
  if (!containers.has(node.nodeType)) return node.nodeValue ?? "";
  const parts = [];
  collectText(node, parts);
  return parts.join("");
}

/**
 * Typed value of a node (dm:typed-value) in a non-schema-aware processor.
 * @param {Node} node
 * @returns {AtomicValue}
 */
export function typedValue(node) {
  const stringTyped = [
    PROCESSING_INSTRUCTION_NODE,
    COMMENT_NODE,
    NAMESPACE_NODE,
  ];
  const type = stringTyped.includes(node.nodeType)
    ? types.string
    : types.untypedAtomic;
  return new AtomicValue(type, nodeStringValue(node));
}

/**
 * Atomizes a sequence (fn:data): atomic values are kept, nodes give their
 * typed value, arrays are flattened recursively.
 * @param {Array} sequence
 * @returns {AtomicValue[]}
 * @throws {XPathError} FOTY0013 for maps and function items
 */
export function atomize(sequence) {
  const result = [];
  for (const item of sequence) {
    const kind = itemKind(item);
    if (kind === "atomic") result.push(item);
    else if (kind === "node") result.push(typedValue(item));
    else if (kind === "array") result.push(...atomize(item.members.flat()));
    else throw new XPathError("FOTY0013", `A ${kind} cannot be atomized`);
  }
  return result;
}

/**
 * String value of an item (fn:string).
 * @param {*} item - Atomic value or node
 * @returns {string}
 * @throws {XPathError} FOTY0014 for maps, arrays and function items
 */
export function stringValue(item) {
  const kind = itemKind(item);
  if (kind === "atomic") return canonicalString(item);
  if (kind === "node") return nodeStringValue(item);
  throw new XPathError("FOTY0014", `A ${kind} has no string value`);
}

const stringPrimitives = new Set(["string", "anyURI", "untypedAtomic"]);
const numericPrimitives = new Set(["decimal", "float", "double"]);

/**
 * Effective boolean value of a sequence (fn:boolean, XPath 3.1 2.4.3).
 * @param {Array} sequence
 * @returns {boolean}
 * @throws {XPathError} FORG0006 when the sequence has no EBV
 */
export function effectiveBooleanValue(sequence) {
  if (sequence.length === 0) return false;
  const first = sequence[0];
  const kind = itemKind(first);
  if (kind === "node") return true;
  if (kind === "atomic" && sequence.length === 1) {
    const { type, value } = first;
    const primitive = type.primitive.localName;
    if (primitive === "boolean") return value;
    if (stringPrimitives.has(primitive)) return value.length > 0;
    if (numericPrimitives.has(primitive)) {
      if (typeof value === "object") return value.sign() !== 0;
      return !(Number.isNaN(value) || value === 0 || value === 0n);
    }
  }
  throw new XPathError(
    "FORG0006",
    "The sequence has no effective boolean value",
  );
}
