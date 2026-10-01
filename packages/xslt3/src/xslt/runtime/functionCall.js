/**
 * Calls of stylesheet functions (xsl:function) from XPath: the arguments
 * converted to the parameter types and bound, the body run with an
 * absent focus, the result converted to the declared type.
 *
 * @module @tradik/xslt3/xslt/runtime/functionCall
 */

import { SequenceReceiver } from "./sequenceReceiver.js";

/**
 * Calls a compiled stylesheet function.
 * @param {{params: object[], body: Array, convert: Function}} compiled
 * @param {Array<Array>} args - Argument values
 * @param {object} context - XPath dynamic context of the call
 * @returns {Array} the result
 */
export function callFunction(compiled, args, context) {
  const caller = context.xc;
  const { tx } = caller;
  let env = tx.globalEnv;
  compiled.params.forEach((param, i) => {
    env = { value: param.convert(args[i]), next: env };
  });
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
