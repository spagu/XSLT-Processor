/**
 * Compiler of inline function expressions (XPath 3.1 section 3.1.7): a
 * closure over the variables in scope, with an absent focus in its body;
 * arguments and result are converted to the declared types.
 *
 * @module @tradik/xslt3/xpath/eval/inline
 */

import { dynamicCallContext } from "./dynamicCall.js";
import { XPathError } from "../../errors.js";
import { FunctionItem } from "../../items/function.js";
import { coerce } from "./coercion.js";
import { bindVariable } from "./scope.js";
import { ANY_SEQUENCE, compileSequenceType } from "./sequenceType.js";
import { clark, namespaceOf } from "./staticContext.js";

/** Compilers by node type. */
export const inlineCompilers = {
  InlineFunctionExpr(node, scope, compile) {
    const { sc } = scope;
    const keys = node.params.map((param) =>
      clark(namespaceOf(param.name, sc, ""), param.name.local),
    );
    if (new Set(keys).size !== keys.length) {
      throw new XPathError(
        "XQST0039",
        "Two parameters of an inline function have the same name",
      );
    }
    const params = node.params.map((param) =>
      param.sequenceType
        ? compileSequenceType(param.sequenceType, sc)
        : ANY_SEQUENCE,
    );
    const returns = node.returnType
      ? compileSequenceType(node.returnType, sc)
      : ANY_SEQUENCE;
    let bodyScope = scope;
    for (const key of keys) bodyScope = bindVariable(bodyScope, key);
    const body = compile(node.body, bodyScope);
    const arity = keys.length;
    const argOptions = keys.map((_, i) => ({
      what: `argument ${i + 1} of an inline function`,
    }));
    const resultOptions = { what: "result of an inline function" };
    const signature = { params, returns };
    return (ctx) => [
      new FunctionItem({
        arity,
        signature,
        invoke: (args) => {
          let env = ctx.env;
          for (let i = 0; i < arity; i++) {
            env = {
              value: coerce(args[i], params[i], argOptions[i]),
              next: env,
            };
          }
          const value = body({
            item: undefined,
            position: 0,
            size: 0,
            env,
            dyn: dynamicCallContext(ctx.dyn),
          });
          return coerce(value, returns, resultOptions);
        },
      }),
    ];
  },
};
