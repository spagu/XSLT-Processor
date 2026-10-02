/**
 * The compiler: static analysis and translation of an AST into nested
 * closures, in one pass. Names are resolved (XPST0081), variables
 * (XPST0008), functions (XPST0017) and types (XPST0051, XPST0080) checked,
 * and each node becomes an evaluator `(ctx) => Item[]`, so evaluation
 * never walks the AST again.
 *
 * @module @tradik/xslt3/xpath/eval/compiler
 */

import { XPathError } from "../../errors.js";
import { callCompilers } from "./calls.js";
import { constructorCompilers } from "./constructors.js";
import { flowCompilers } from "./flow.js";
import { inlineCompilers } from "./inline.js";
import { operatorCompilers } from "./operators.js";
import { pathCompilers } from "./paths.js";
import { primaryCompilers } from "./primary.js";
import { typeCompilers } from "./typeExprs.js";

/** Compilers by AST node type. */
const compilers = {
  ...primaryCompilers,
  ...flowCompilers,
  ...operatorCompilers,
  ...typeCompilers,
  ...pathCompilers,
  ...callCompilers,
  ...inlineCompilers,
  ...constructorCompilers,
};

/**
 * Compiles an expression node.
 * @param {import("../syntax/ast.js").Expr} node
 * @param {import("./scope.js").Scope} scope
 * @returns {import("./scope.js").Evaluator}
 * @throws {XPathError} the static errors of the expression
 */
export function compileNode(node, scope) {
  const compiler = compilers[node.type];
  if (!compiler) {
    throw new XPathError("XPST0003", `Unsupported expression ${node.type}`);
  }
  return compiler(node, scope, compileNode);
}

/**
 * Runs a function, turning the RangeErrors of JavaScript limits (stack
 * depth of deeply nested expressions or recursive functions, string,
 * array and BigInt sizes) into XPDY0130, the error for implementation
 * limits.
 * @template T
 * @param {() => T} run
 * @returns {T}
 * @throws {XPathError} XPDY0130 instead of a RangeError
 */
export function withinLimits(run) {
  try {
    return run();
  } catch (error) {
    if (error instanceof RangeError) {
      throw new XPathError(
        "XPDY0130",
        `Implementation limit exceeded: ${error.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}
