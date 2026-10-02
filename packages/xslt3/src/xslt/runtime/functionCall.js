/**
 * Calls of stylesheet functions (xsl:function) from XPath: the arguments
 * converted to the parameter types and bound, the body run with an
 * absent focus, the result converted to the declared type.
 *
 * @module @tradik/xslt3/xslt/runtime/functionCall
 */

import { cachedCall } from "./functionCache.js";
import { SequenceReceiver } from "./sequenceReceiver.js";

/**
 * Calls a compiled stylesheet function.
 * @param {{params: object[], body: Array, convert: Function,
 *   memo?: boolean}} compiled
 * @param {Array<Array>} args - Argument values
 * @param {object} context - XPath dynamic context of the call
 * @returns {Array} the result
 */
export function callFunction(compiled, args, context) {
  const { tx } = context.xc;
  const values = compiled.params.map((param, i) => param.convert(args[i]));
  if (compiled.memo) {
    return cachedCall(compiled, values, tx, () => run(compiled, values, tx));
  }
  return run(compiled, values, tx);
}

/**
 * Runs the body of a stylesheet function.
 * @param {object} compiled
 * @param {Array<Array>} values - Converted argument values
 * @param {object} tx - The transformation
 * @returns {Array} the result
 */
function run(compiled, values, tx) {
  let env = tx.globalEnv;
  for (const value of values) env = { value, next: env };
  const xc = {
    tx,
    item: undefined,
    position: 0,
    size: 0,
    env,
    mode: tx.defaultMode,
    rule: null,
    group: undefined,
    groupKey: undefined,
    regex: undefined,
    tunnel: null,
    temporary: true,
    dyn: null,
  };
  const out = new SequenceReceiver(tx.scratch);
  tx.machine.runBody(compiled.body, xc, out);
  return compiled.convert(out.items);
}
