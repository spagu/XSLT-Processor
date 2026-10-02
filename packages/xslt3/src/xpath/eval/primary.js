/**
 * Compilers of primary expressions: literals, variable references, the
 * context item, the comma operator and the empty sequence.
 *
 * Evaluators return arrays that callers must not modify: a literal returns
 * the same array every time.
 *
 * @module @tradik/xslt3/xpath/eval/primary
 */

import { XPathError } from "../../errors.js";
import { AtomicValue } from "../../xdm/atomic.js";
import { Decimal } from "../../xdm/decimal.js";
import { types } from "../../xdm/types.js";
import { contextItem, variableDepth } from "./scope.js";
import { clark, namespaceOf } from "./staticContext.js";

const EMPTY = Object.freeze([]);

/**
 * @param {import("../syntax/ast.js").NumericLiteral} node
 * @returns {AtomicValue}
 */
function numericValue(node) {
  if (node.kind === "integer") {
    return new AtomicValue(types.integer, BigInt(node.value));
  }
  if (node.kind === "decimal") {
    return new AtomicValue(types.decimal, Decimal.parse(node.value));
  }
  return new AtomicValue(types.double, Number(node.value));
}

/**
 * Evaluator of a variable reference resolved to a depth.
 * @param {number} depth
 * @param {string} name - For the error message
 * @returns {import("./scope.js").Evaluator}
 */
function variableReader(depth, name) {
  const check = (value) => {
    if (value === undefined) {
      throw new XPathError("XPDY0002", `No value is bound to $${name}`);
    }
    return value;
  };
  if (depth === 0) return (ctx) => check(ctx.env.value);
  return (ctx) => {
    let env = ctx.env;
    for (let i = 0; i < depth; i++) env = env.next;
    return check(env.value);
  };
}

/** Compilers by node type. */
export const primaryCompilers = {
  NumericLiteral(node) {
    const result = Object.freeze([numericValue(node)]);
    return () => result;
  },

  StringLiteral(node) {
    const result = Object.freeze([new AtomicValue(types.string, node.value)]);
    return () => result;
  },

  EmptySequence() {
    return () => EMPTY;
  },

  ContextItemExpr() {
    return (ctx) => [contextItem(ctx)];
  },

  VarRef(node, scope) {
    const key = clark(namespaceOf(node.name, scope.sc, ""), node.name.local);
    const depth = variableDepth(scope, key);
    if (depth < 0) {
      throw new XPathError(
        "XPST0008",
        `The variable $${node.name.local} is not declared`,
      );
    }
    return variableReader(depth, node.name.local);
  },

  SequenceExpr(node, scope, compile) {
    const parts = node.items.map((item) => compile(item, scope));
    return (ctx) => {
      const result = [];
      for (const part of parts) {
        for (const item of part(ctx)) result.push(item);
      }
      return result;
    };
  },
};

export { EMPTY };
