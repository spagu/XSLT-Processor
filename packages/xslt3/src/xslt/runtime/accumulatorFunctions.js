/**
 * accumulator-before() and accumulator-after() (XSLT 3.0 sections
 * 18.2.6 and 18.2.7).
 *
 * @module @tradik/xslt3/xslt/runtime/accumulatorFunctions
 */

import { isNode } from "../../xdm/atomic.js";
import { xsltError } from "../names.js";
import { accumulatorValue } from "./accumulators.js";
import { nameArgument } from "./availability.js";

/**
 * Implementation of both functions.
 * @param {boolean} after
 * @returns {(args: Array, context: object) => Array}
 */
const accumulatorFunction = (after) => (args, context) => {
  const [[name]] = args;
  const { uri, local } = nameArgument(name.value, context, "XTDE3340");
  const key = `{${uri}}${local}`;
  if (!context.xc.tx.stylesheet.accumulators.has(key)) {
    throw xsltError("XTDE3340", `No accumulator ${name.value}`);
  }
  const item = context.contextItem;
  if (item === undefined) {
    throw xsltError("XTDE3350", "An accumulator function needs a context item");
  }
  if (!isNode(item) || item.nodeType === 2 || item.nodeType === 13) {
    throw xsltError(
      "XTTE3360",
      "An accumulator function needs a context node other than an attribute",
    );
  }
  return accumulatorValue(context.xc, key, item, after);
};

/** Function definitions. */
export const accumulatorFunctions = ["before", "after"].map((phase) => ({
  local: `accumulator-${phase}`,
  params: ["xs:string"],
  returns: "item()*",
  focus: true,
  impl: accumulatorFunction(phase === "after"),
}));
