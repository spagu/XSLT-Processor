/**
 * fn:analyze-string (F&O 3.1 section 5.6.6).
 *
 * The result is computed as a plain tree, `{ name, attributes, children }`
 * with string children for text, and then built as DOM nodes through the
 * dynamic context hook `context.createDocument()`, which must return an
 * empty DOM Document (createElementNS, createTextNode, setAttribute and
 * appendChild are used). The element is appended to that document, as
 * its document element, and returned. Without the hook the plain tree is
 * returned as is.
 *
 * @module @tradik/xslt3/functions/regex/analyzeString
 */

import { define, FN_NAMESPACE, stringArg } from "../support.js";
import { allMatches, compileRegex, rejectEmptyMatch } from "./compile.js";

/**
 * @typedef {object} ResultElement
 * @property {string} name - Local name in the fn namespace
 * @property {Record<string, string>} attributes
 * @property {Array<ResultElement|string>} children
 */

/** @returns {ResultElement} */
const element = (name, children, attributes = {}) => ({
  name,
  attributes,
  children,
});

/**
 * Children of a match or group: text and the nested groups.
 * @param {RegExpExecArray} match - With indices
 * @param {import("./compile.js").CompiledRegex} compiled
 * @param {number} parent - Group number, 0 for the whole match
 * @param {[number, number]} range - Offsets of the parent in the input
 * @returns {Array<ResultElement|string>}
 */
function groupChildren(match, compiled, parent, [start, end]) {
  const input = match.input;
  const children = [];
  let position = start;
  for (let group = 1; group <= compiled.groups; group++) {
    const span = match.indices[group];
    // a group of an earlier iteration of a repeated parent lies outside it
    if (
      compiled.parents[group] !== parent ||
      span === undefined ||
      span[0] < position ||
      span[1] > end
    ) {
      continue;
    }
    if (span[0] > position) children.push(input.slice(position, span[0]));
    children.push(
      element("group", groupChildren(match, compiled, group, span), {
        nr: String(group),
      }),
    );
    position = span[1];
  }
  if (position < end) children.push(input.slice(position, end));
  return children;
}

/**
 * The fn:analyze-string-result tree of a string.
 * @param {string} input
 * @param {string} pattern
 * @param {string} [flags=""]
 * @returns {ResultElement}
 * @throws {XPathError} FORX0001, FORX0002, FORX0003
 */
export function analyzeStringTree(input, pattern, flags = "") {
  const compiled = compileRegex(pattern, flags);
  rejectEmptyMatch(compiled);
  const children = [];
  let last = 0;
  for (const match of allMatches(compiled, input)) {
    if (match.index > last) {
      children.push(element("non-match", [input.slice(last, match.index)]));
    }
    children.push(
      element("match", groupChildren(match, compiled, 0, match.indices[0])),
    );
    last = match.index + match[0].length;
  }
  if (last < input.length) {
    children.push(element("non-match", [input.slice(last)]));
  }
  return element("analyze-string-result", children);
}

/**
 * Builds a result tree as DOM nodes.
 * @param {ResultElement} tree
 * @param {Document} doc
 * @returns {Element}
 */
export function toDom(tree, doc) {
  const node = doc.createElementNS(FN_NAMESPACE, tree.name);
  for (const [name, value] of Object.entries(tree.attributes)) {
    node.setAttribute(name, value);
  }
  for (const child of tree.children) {
    node.appendChild(
      typeof child === "string" ? doc.createTextNode(child) : toDom(child, doc),
    );
  }
  return node;
}

/**
 * fn:analyze-string implementation.
 * @param {Array<*>[]} args - [$input, $pattern, $flags?]
 * @param {{createDocument?: () => Document}} context
 * @returns {Array<*>}
 */
function analyzeString([input, [pattern], flags], context) {
  const tree = analyzeStringTree(
    stringArg(input),
    pattern.value,
    flags === undefined ? "" : flags[0].value,
  );
  const doc = context.createDocument?.();
  if (!doc) return [tree];
  const root = toDom(tree, doc);
  doc.appendChild(root);
  return [root];
}

const RESULT = "element(fn:analyze-string-result)";

/** @type {import("../support.js").FunctionDefinition[]} */
export const analyzeStringFunctions = [
  define("analyze-string", ["xs:string?", "xs:string"], RESULT, analyzeString),
  define(
    "analyze-string",
    ["xs:string?", "xs:string", "xs:string"],
    RESULT,
    analyzeString,
  ),
];
