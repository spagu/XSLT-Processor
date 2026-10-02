/**
 * Compilers of the control-flow expressions: for, let, some/every, if and
 * the simple map operator `!` (XPath 3.1 sections 3.12 to 3.14, 3.17).
 *
 * @module @tradik/xslt3/xpath/eval/flow
 */

import { effectiveBooleanValue } from "../../xdm/nodes.js";
import { booleanItem } from "./atomics.js";
import { bindVariable, withFocus, withVariable } from "./scope.js";
import { clark, namespaceOf } from "./staticContext.js";

/**
 * @param {import("../syntax/ast.js").Binding} binding
 * @param {import("./scope.js").Scope} scope
 * @returns {string} Clark name of the bound variable
 */
const bindingKey = (binding, scope) =>
  clark(namespaceOf(binding.name, scope.sc, ""), binding.name.local);

/**
 * Compiles nested bindings, innermost last: `wrap` builds the evaluator of
 * one binding from its input and the evaluator of what it encloses.
 * @param {import("../syntax/ast.js").Binding[]} bindings
 * @param {import("./scope.js").Scope} scope
 * @param {Function} compile
 * @param {(scope: object) => Function} body - Compiles the innermost part
 * @param {(input: Function, inner: Function) => Function} wrap
 * @returns {import("./scope.js").Evaluator}
 */
function nest(bindings, scope, compile, body, wrap) {
  const level = (index, current) => {
    if (index === bindings.length) return body(current);
    const binding = bindings[index];
    const input = compile(binding.expr, current);
    const inner = level(
      index + 1,
      bindVariable(current, bindingKey(binding, current)),
    );
    return wrap(input, inner);
  };
  return level(0, scope);
}

/** Compilers by node type. */
export const flowCompilers = {
  ForExpr(node, scope, compile) {
    return nest(
      node.bindings,
      scope,
      compile,
      (inner) => compile(node.returnExpr, inner),
      (input, inner) => (ctx) => {
        const result = [];
        for (const item of input(ctx)) {
          for (const out of inner(withVariable(ctx, [item]))) result.push(out);
        }
        return result;
      },
    );
  },

  LetExpr(node, scope, compile) {
    return nest(
      node.bindings,
      scope,
      compile,
      (inner) => compile(node.returnExpr, inner),
      (input, inner) => (ctx) => inner(withVariable(ctx, input(ctx))),
    );
  },

  QuantifiedExpr(node, scope, compile) {
    const some = node.quantifier === "some";
    const test = nest(
      node.bindings,
      scope,
      compile,
      (inner) => {
        const satisfies = compile(node.satisfies, inner);
        return (ctx) => effectiveBooleanValue(satisfies(ctx));
      },
      (input, inner) => (ctx) => {
        for (const item of input(ctx)) {
          if (inner(withVariable(ctx, [item])) === some) return some;
        }
        return !some;
      },
    );
    return (ctx) => [booleanItem(test(ctx))];
  },

  IfExpr(node, scope, compile) {
    const condition = compile(node.condition, scope);
    const thenExpr = compile(node.thenExpr, scope);
    const elseExpr = compile(node.elseExpr, scope);
    return (ctx) =>
      effectiveBooleanValue(condition(ctx)) ? thenExpr(ctx) : elseExpr(ctx);
  },

  SimpleMapExpr(node, scope, compile) {
    const left = compile(node.left, scope);
    const right = compile(node.right, scope);
    return (ctx) => {
      const input = left(ctx);
      const result = [];
      const size = input.length;
      for (let i = 0; i < size; i++) {
        const out = right(withFocus(ctx, input[i], i + 1, size));
        for (const item of out) result.push(item);
      }
      return result;
    };
  },
};
