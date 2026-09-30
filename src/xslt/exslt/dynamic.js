/**
 * EXSLT dynamic module (http://exslt.org/dynamic): `dyn:evaluate()` only,
 * following libexslt `dynamic.c`.
 *
 * Security: a stylesheet is trusted code, but the string handed to
 * `dyn:evaluate()` often comes from the transformed document. The function
 * is therefore disabled unless the engine opts in with
 * `engine.enableDynamicEvaluate = true`; while disabled,
 * `function-available('dyn:evaluate')` is false and a call throws. The
 * expression runs with the evaluator's recursion and result size limits.
 */

"use strict";

import { expandedFunctionName } from "../../xpath/evaluator.js";
import { parse } from "../../xpath/parser.js";
import { EXSLT_DYNAMIC, checkArity } from "./arguments.js";

/**
 * Build the EXSLT dynamic functions.
 *
 * @param {import('../../xpath/evaluator.js').XPathEvaluator} evaluator - Evaluates the expressions
 * @param {() => boolean} isEnabled - Whether `dyn:evaluate()` may run, asked at each call
 * @returns {Object<string, Function>} Functions keyed by expanded name
 */
export function createDynamicFunctions(evaluator, isEnabled) {
  /**
   * `dyn:evaluate(string)`: evaluate the string as an XPath expression in
   * the current context (context node, position, size, variables and
   * namespaces). An empty string, or an expression that fails to parse,
   * yields an empty node-set, as in libexslt. Evaluation errors propagate,
   * so the evaluator's limits cannot be defeated by swallowing them.
   *
   * @param {Array} args - Argument expressions
   * @param {import('../../xpath/evaluator.js').XPathContext} ctx - Evaluation context
   * @returns {*} The value of the expression
   * @throws {Error} When dynamic evaluation is disabled
   */
  const evaluate = (args, ctx) => {
    if (!isEnabled()) {
      throw new Error(
        "dyn:evaluate() is disabled; set enableDynamicEvaluate on the engine to allow it",
      );
    }
    checkArity("dyn:evaluate", args, 1);
    const expression = evaluator.toString(evaluator.evaluate(args[0], ctx));
    if (expression === "") return [];
    let ast;
    try {
      ast = parse(expression);
    } catch {
      return [];
    }
    return evaluator.evaluate(ast, ctx);
  };
  evaluate.isAvailable = isEnabled;

  return { [expandedFunctionName(EXSLT_DYNAMIC, "evaluate")]: evaluate };
}
