/**
 * fn:copy-of and fn:snapshot (XSLT 3.0 sections 20.6 and 20.7): deep
 * copies of nodes (a snapshot is approximated by a copy).
 *
 * @module @tradik/xslt3/xslt/runtime/copyFunctions
 */

import { isNode } from "../../xdm/atomic.js";
import { xsltError } from "../names.js";
import { SequenceReceiver } from "./sequenceReceiver.js";

/**
 * Copies the nodes of a sequence; other items are kept.
 * @param {Array} items
 * @param {object} context - XPath dynamic context
 * @returns {Array}
 */
function copyItems(items, context) {
  const out = new SequenceReceiver(context.xc.tx.scratch);
  for (const item of items) {
    if (isNode(item)) out.copy(item, true);
    else out.item(item);
  }
  return out.items;
}

/**
 * The context item of a focus function.
 * @param {object} context
 * @returns {Array}
 * @throws {import("../../errors.js").XPathError} XPDY0002 when absent
 */
function contextItemOf(context) {
  if (context.contextItem === undefined) {
    throw xsltError("XPDY0002", "The context item is absent");
  }
  return [context.contextItem];
}

/** Function definitions. */
export const copyFunctions = ["copy-of", "snapshot"].flatMap((local) => [
  {
    local,
    params: [],
    returns: "item()*",
    focus: true,
    impl: (_, context) => copyItems(contextItemOf(context), context),
  },
  {
    local,
    params: ["item()*"],
    returns: "item()*",
    impl: ([items], context) => copyItems(items, context),
  },
]);
