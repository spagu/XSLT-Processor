/**
 * Values computed from sequence constructors at run time: the sequence a
 * body produces, temporary trees, simple content (XSLT 3.0 section
 * 5.7.2) and attribute value templates.
 *
 * @module @tradik/xslt3/xslt/runtime/values
 */

import { atomize } from "../../xdm/nodes.js";
import { canonicalString } from "../../xdm/lexical.js";
import { derive, evaluate } from "./context.js";
import { SequenceReceiver } from "./sequenceReceiver.js";
import { TreeReceiver } from "./treeReceiver.js";

/**
 * Runs a body and returns the sequence it produces.
 * @param {import("./machine.js").Body} body
 * @param {object} xc
 * @param {import("./machine.js").Machine} machine
 * @returns {Array}
 */
export function bodySequence(body, xc, machine) {
  const out = new SequenceReceiver(xc.tx.scratch);
  machine.runBody(body, derive(xc, { temporary: true }), out);
  return out.items;
}

/**
 * Runs a body to build a temporary tree.
 * @param {import("./machine.js").Body} body
 * @param {object} xc
 * @param {import("./machine.js").Machine} machine
 * @returns {Node} its document node (a document fragment)
 */
export function temporaryTree(body, xc, machine) {
  const fragment = xc.tx.scratch().createDocumentFragment();
  const out = new TreeReceiver(fragment, new Map());
  machine.runBody(body, derive(xc, { temporary: true }), out);
  return fragment;
}

/**
 * The string of simple content: zero-length text nodes dropped, adjacent
 * text nodes merged, then the items atomized and joined.
 * @param {Array} items
 * @param {string} separator
 * @returns {string}
 */
export function simpleContent(items, separator) {
  const parts = [];
  let text = null;
  for (const item of items) {
    if (item?.nodeType === 3) {
      if (item.nodeValue !== "") text = (text ?? "") + item.nodeValue;
      continue;
    }
    if (text !== null) parts.push(text);
    text = null;
    for (const value of atomize([item])) parts.push(canonicalString(value));
  }
  if (text !== null) parts.push(text);
  return parts.join(separator);
}

/**
 * Evaluator of a compiled attribute value template.
 * @param {Array<string|object>} parts - See ExpressionCompiler.avt
 * @param {boolean} [compatible] - Backwards-compatible: first item only
 * @returns {(xc: object) => string}
 */
export function avtEvaluator(parts, compatible = false) {
  if (parts.length === 1 && typeof parts[0] === "string") {
    const constant = parts[0];
    return () => constant;
  }
  return (xc) => {
    let result = "";
    for (const part of parts) {
      if (typeof part === "string") result += part;
      else {
        const value = evaluate(part, xc);
        result += simpleContent(compatible ? value.slice(0, 1) : value, " ");
      }
    }
    return result;
  };
}
