/**
 * fn:copy-of and fn:snapshot (XSLT 3.0 sections 20.6 and 20.7): deep
 * copies of nodes; a snapshot also copies the ancestors of each node.
 *
 * @module @tradik/xslt3/xslt/runtime/copyFunctions
 */

import { isNode } from "../../xdm/atomic.js";
import { xsltError } from "../names.js";
import { setOrigin } from "./accumulators.js";
import { SequenceReceiver } from "./sequenceReceiver.js";
import { snapshotNode } from "./snapshot.js";

/**
 * Copies the nodes of a sequence; other items are kept.
 * @param {Array} items
 * @param {object} context - XPath dynamic context
 * @param {boolean} snapshot - fn:snapshot: copy the ancestors too
 * @returns {Array}
 */
function copyItems(items, context, snapshot) {
  const result = [];
  for (const item of items) {
    if (!isNode(item)) {
      result.push(item);
      continue;
    }
    const out = new SequenceReceiver(context.xc.tx.scratch);
    let copy;
    if (snapshot) {
      copy = snapshotNode(item, out, (c, o) => setOrigin(context.xc.tx, c, o));
    } else {
      out.copy(item, true);
      copy = out.items.at(-1);
    }
    setOrigin(context.xc.tx, copy, item);
    result.push(copy);
  }
  return result;
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
    impl: (_, context) =>
      copyItems(contextItemOf(context), context, local === "snapshot"),
  },
  {
    local,
    params: ["item()*"],
    returns: "item()*",
    impl: ([items], context) => copyItems(items, context, local === "snapshot"),
  },
]);
