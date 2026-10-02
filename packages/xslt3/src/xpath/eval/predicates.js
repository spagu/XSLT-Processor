/**
 * Predicates (XPath 3.1 section 3.3.3): a numeric predicate value selects
 * the item at that position, any other value is taken as an effective
 * boolean value. A literal integer predicate is compiled to an index.
 *
 * @module @tradik/xslt3/xpath/eval/predicates
 */

import { isAtomic } from "../../xdm/atomic.js";
import { effectiveBooleanValue } from "../../xdm/nodes.js";
import { isNumericType } from "../../xdm/types.js";
import { withFocus } from "./scope.js";

/**
 * A compiled predicate: filters a sequence (in its order, which gives the
 * context positions).
 * @typedef {(items: Array, ctx: import("./scope.js").Context) => Array} Predicate
 */

/**
 * Whether a predicate value keeps the item at a position.
 * @param {Array} value
 * @param {number} position
 * @returns {boolean}
 */
export function predicateTruth(value, position) {
  if (value.length === 1 && isAtomic(value[0])) {
    const { type, value: number } = value[0];
    if (isNumericType(type)) return Number(number) === position;
  }
  return effectiveBooleanValue(value);
}

/**
 * @param {import("../syntax/ast.js").Expr} node - Predicate expression
 * @param {import("./scope.js").Scope} scope
 * @param {Function} compile
 * @returns {Predicate}
 */
export function compilePredicate(node, scope, compile) {
  if (node.type === "NumericLiteral" && node.kind === "integer") {
    const index = Number(node.value) - 1;
    return (items) =>
      index >= 0 && index < items.length ? [items[index]] : [];
  }
  const predicate = compile(node, scope);
  return (items, ctx) => {
    const size = items.length;
    const result = [];
    for (let i = 0; i < size; i++) {
      const value = predicate(withFocus(ctx, items[i], i + 1, size));
      if (predicateTruth(value, i + 1)) result.push(items[i]);
    }
    return result;
  };
}
