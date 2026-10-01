/**
 * Compilers of function calls (XPath 3.1 section 3.1.5): static calls,
 * partial application, named function references, dynamic calls and the
 * arrow operator.
 *
 * @module @tradik/xslt3/xpath/eval/calls
 */

import { XPathError } from "../../errors.js";
import { FunctionItem } from "../../items/function.js";
import { isFunctionItem } from "../../xdm/atomic.js";
import { integerItem } from "./atomics.js";
import { functionItemOf, resolveFunction } from "./functionItems.js";
import { contextItem } from "./scope.js";
import { signatureOf } from "./sequenceType.js";
import { namespaceOf } from "./staticContext.js";
import { NS } from "../../functions/signatures.js";

const isPlaceholder = (arg) => arg.type === "ArgumentPlaceholder";

/**
 * Partial application: a function item taking the placeholder arguments.
 * @param {Array<Function|null>} args - Evaluators, null for placeholders
 * @param {{params: object[], returns: object}|null} signature - Of the
 *   target function, null when unknown
 * @param {(ctx: object) => (args: Array<Array>) => Array} target - Gives
 *   the function to call
 * @returns {import("./scope.js").Evaluator}
 */
function partial(args, signature, target) {
  const holes = [];
  args.forEach((arg, i) => arg === null && holes.push(i));
  return (ctx) => {
    const { invoke, signature: actual = signature } = target(ctx);
    const fixed = args.map((arg) => (arg === null ? null : arg(ctx)));
    return [
      new FunctionItem({
        arity: holes.length,
        signature: {
          params: holes.map((i) => actual.params[i]),
          returns: actual.returns,
        },
        invoke: (values) => {
          const all = fixed.slice();
          holes.forEach((hole, i) => (all[hole] = values[i]));
          return invoke(all);
        },
      }),
    ];
  };
}

/**
 * @param {Array} sequence - Value of the function expression
 * @param {number} arity - Number of arguments supplied
 * @returns {*} the function item to call
 * @throws {XPathError} XPTY0004 when it is not a single function of that
 *   arity
 */
function calledFunction(sequence, arity) {
  const [item] = sequence;
  if (sequence.length !== 1 || !isFunctionItem(item)) {
    throw new XPathError(
      "XPTY0004",
      "A dynamic function call needs exactly one function item",
    );
  }
  if (item.arity !== arity) {
    throw new XPathError(
      "XPTY0004",
      `The function has arity ${item.arity}, not ${arity}`,
    );
  }
  return item;
}

/** Compilers by node type. */
export const callCompilers = {
  FunctionCall(node, scope, compile) {
    const { sc } = scope;
    const uri = namespaceOf(node.name, sc, sc.defaultFunctionNamespace);
    const local = node.name.local;
    const arity = node.arguments.length;
    const resolved = resolveFunction(uri, local, arity, sc);
    const args = node.arguments.map((arg) =>
      isPlaceholder(arg) ? null : compile(arg, scope),
    );
    if (resolved.signature === null) return () => resolved.call();
    if (args.includes(null)) {
      return partial(args, resolved.signature, (ctx) => ({
        invoke: (values) => resolved.call(values, ctx),
      }));
    }
    if (uri === NS.fn && arity === 0 && resolved.focus) {
      if (local === "position") {
        return (ctx) => (contextItem(ctx), [integerItem(ctx.position)]);
      }
      if (local === "last") {
        return (ctx) => (contextItem(ctx), [integerItem(ctx.size)]);
      }
    }
    const { call } = resolved;
    if (arity === 1) {
      const [arg] = args;
      return (ctx) => call([arg(ctx)], ctx);
    }
    return (ctx) =>
      call(
        args.map((arg) => arg(ctx)),
        ctx,
      );
  },

  NamedFunctionRef(node, scope) {
    const { sc } = scope;
    const uri = namespaceOf(node.name, sc, sc.defaultFunctionNamespace);
    const resolved = resolveFunction(uri, node.name.local, node.arity, sc);
    return (ctx) => [functionItemOf(resolved, ctx)];
  },

  DynamicFunctionCall(node, scope, compile) {
    const target = compile(node.functionExpr, scope);
    const arity = node.arguments.length;
    const args = node.arguments.map((arg) =>
      isPlaceholder(arg) ? null : compile(arg, scope),
    );
    if (args.includes(null)) {
      return partial(args, null, (ctx) => {
        const item = calledFunction(target(ctx), arity);
        return {
          invoke: (values) => item.invoke(values),
          signature: signatureOf(item),
        };
      });
    }
    return (ctx) => {
      const item = calledFunction(target(ctx), arity);
      return item.invoke(args.map((arg) => arg(ctx)));
    };
  },

  ArrowExpr(node, scope, compile) {
    const args = [node.expr, ...node.arguments];
    const { start, end } = node;
    if (node.functionName) {
      return compile(
        {
          type: "FunctionCall",
          name: node.functionName,
          arguments: args,
          start,
          end,
        },
        scope,
      );
    }
    return compile(
      {
        type: "DynamicFunctionCall",
        functionExpr: node.functionExpr,
        arguments: args,
        start,
        end,
      },
      scope,
    );
  },
};
