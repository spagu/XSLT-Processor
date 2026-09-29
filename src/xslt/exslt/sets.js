/**
 * EXSLT sets module (http://exslt.org/sets), following libexslt `sets.c` and
 * the libxml2 node-set primitives it calls.
 *
 * Every argument must be a node-set and every node-set result is in document
 * order. `leading()` / `trailing()` return the first node-set unchanged when
 * the second is empty, and an empty node-set when the first node of the
 * second is not in the first.
 */

"use strict";

import { expandedFunctionName } from "../../xpath/evaluator.js";
import {
  EXSLT_SETS,
  checkArity,
  inDocumentOrder,
  toNodeSet,
} from "./arguments.js";

/**
 * Build the EXSLT sets functions.
 *
 * @param {import('../../xpath/evaluator.js').XPathEvaluator} evaluator - Evaluates the arguments
 * @returns {Object<string, Function>} Functions keyed by expanded name
 */
export function createSetsFunctions(evaluator) {
  /**
   * Evaluate the node-set arguments of a call, each in document order.
   *
   * @param {string} name - Function name, for errors
   * @param {Array} args - Argument expressions
   * @param {object} ctx - Evaluation context
   * @param {number} count - Required number of arguments
   * @returns {Node[][]} The node-sets
   */
  const nodeSets = (name, args, ctx, count) => {
    checkArity(name, args, count);
    return args.map((arg) =>
      inDocumentOrder(evaluator, toNodeSet(name, evaluator.evaluate(arg, ctx))),
    );
  };

  /**
   * `leading()` / `trailing()`: the nodes of the first node-set before or
   * after the first node of the second one.
   *
   * @param {string} name - Function name, for errors
   * @param {boolean} before - True for leading, false for trailing
   * @returns {Function} The XPath function
   */
  const around = (name, before) => (args, ctx) => {
    const [nodes, others] = nodeSets(name, args, ctx, 2);
    if (others.length === 0) return nodes;

    const index = nodes.indexOf(others[0]);
    if (index === -1) return [];
    return before ? nodes.slice(0, index) : nodes.slice(index + 1);
  };

  const key = (local) => expandedFunctionName(EXSLT_SETS, local);

  return {
    [key("difference")]: (args, ctx) => {
      const [nodes, others] = nodeSets("set:difference", args, ctx, 2);
      const excluded = new Set(others);
      return nodes.filter((node) => !excluded.has(node));
    },

    [key("intersection")]: (args, ctx) => {
      const [nodes, others] = nodeSets("set:intersection", args, ctx, 2);
      const included = new Set(others);
      return nodes.filter((node) => included.has(node));
    },

    [key("distinct")]: (args, ctx) => {
      const [nodes] = nodeSets("set:distinct", args, ctx, 1);
      const seen = new Set();
      return nodes.filter((node) => {
        const value = evaluator.getStringValue(node);
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    },

    [key("has-same-node")]: (args, ctx) => {
      const [nodes, others] = nodeSets("set:has-same-node", args, ctx, 2);
      const included = new Set(others);
      return nodes.some((node) => included.has(node));
    },

    [key("leading")]: around("set:leading", true),
    [key("trailing")]: around("set:trailing", false),
  };
}
