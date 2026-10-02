/**
 * Access to the focus from function implementations (definitions with
 * `focus: true`).
 *
 * @module @tradik/xslt3/functions/focus
 */

import { XPathError } from "../errors.js";
import { isNode } from "../xdm/atomic.js";

/**
 * @param {import("./registry.js").DynamicContext} context
 * @returns {*} the context item
 * @throws {XPathError} XPDY0002 when the focus is absent
 */
export function focusItem(context) {
  if (context.contextItem === undefined) {
    throw new XPathError("XPDY0002", "The context item is absent");
  }
  return context.contextItem;
}

/**
 * @param {import("./registry.js").DynamicContext} context
 * @returns {Node} the context item, which must be a node
 * @throws {XPathError} XPDY0002 when absent, XPTY0004 when not a node
 */
export function focusNode(context) {
  const item = focusItem(context);
  if (!isNode(item)) {
    throw new XPathError("XPTY0004", "The context item is not a node");
  }
  return item;
}
