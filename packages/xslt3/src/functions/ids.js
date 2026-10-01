/**
 * fn:id, fn:element-with-id and fn:idref (F&O 3.1 sections 14.5.2 to
 * 14.5.4). Without a schema, IDs are `xml:id` attributes and attributes
 * declared ID in the internal DTD subset; IDREF/IDREFS attributes are
 * those declared so in the internal DTD subset (see attributeTypes.js).
 * Elements are never IDs themselves (that needs a schema), so
 * fn:element-with-id finds the same elements as fn:id.
 *
 * @module @tradik/xslt3/functions/ids
 */

import { XPathError } from "../errors.js";
import { namePatterns } from "../xdm/types.js";
import { attributesOf, rootOf } from "../xpath/eval/domNodes.js";
import { attributeType } from "./attributeTypes.js";
import { focusNode } from "./focus.js";
import { define } from "./support.js";

/** @param {string} s @returns {string[]} whitespace-separated tokens */
const tokens = (s) => s.split(/[\t\n\r ]+/).filter(Boolean);

/**
 * The document node a search starts from.
 * @param {Node} node
 * @returns {Node}
 * @throws {XPathError} FODC0001 when the tree is not rooted at a document
 */
function documentOf(node) {
  const root = rootOf(node);
  if (root.nodeType !== 9 && root.nodeType !== 11) {
    throw new XPathError("FODC0001", "The tree is not rooted at a document");
  }
  return root;
}

/**
 * The elements of a tree in document order.
 * @param {Node} root
 * @returns {Generator<Element>}
 */
function* elements(root) {
  const stack = [root.firstChild];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    stack.push(node.nextSibling);
    if (node.nodeType === 1) {
      yield node;
      stack.push(node.firstChild);
    }
  }
}

/**
 * fn:id: the elements with an ID attribute equal to one of the tokens,
 * the first in document order for each value.
 * @param {Array} args - [$arg, $node]
 * @returns {Element[]}
 */
function findIds([values, [node]]) {
  const wanted = new Set(values.flatMap((v) => tokens(v.value)));
  const result = [];
  for (const element of elements(documentOf(node))) {
    if (wanted.size === 0) break;
    for (const attribute of attributesOf(element)) {
      const value = tokens(attribute.value).join(" ");
      if (wanted.has(value) && attributeType(attribute, element) === "ID") {
        wanted.delete(value);
        if (result.at(-1) !== element) result.push(element);
      }
    }
  }
  return result;
}

/**
 * fn:idref: the IDREF and IDREFS attributes that refer to one of the IDs.
 * @param {Array} args - [$arg, $node]
 * @returns {Attr[]}
 */
function findIdrefs([values, [node]]) {
  const wanted = new Set(
    values
      .map((v) => tokens(v.value).join(" "))
      .filter((v) => namePatterns.ncName.test(v)),
  );
  const result = [];
  if (wanted.size === 0) return result;
  for (const element of elements(documentOf(node))) {
    for (const attribute of attributesOf(element)) {
      const type = attributeType(attribute, element);
      if (
        (type === "IDREF" || type === "IDREFS") &&
        tokens(attribute.value).some((t) => wanted.has(t))
      ) {
        result.push(attribute);
      }
    }
  }
  return result;
}

/**
 * Definitions of a function in its two arities (the context node, else
 * the given node, locates the document).
 * @param {string} local
 * @param {string} returns
 * @param {(args: Array) => Node[]} impl
 * @returns {object[]}
 */
const family = (local, returns, impl) => [
  define(
    local,
    ["xs:string*"],
    returns,
    ([values], context) => impl([values, [focusNode(context)]]),
    { focus: true },
  ),
  define(local, ["xs:string*", "node()"], returns, impl),
];

/** Function definitions. */
export const idFunctions = [
  ...family("id", "element()*", findIds),
  ...family("element-with-id", "element()*", findIds),
  ...family("idref", "node()*", findIdrefs),
];
