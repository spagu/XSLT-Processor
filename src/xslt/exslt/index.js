/**
 * EXSLT extension functions (https://exslt.org/), the set libexslt provides
 * to libxslt and so to Chrome's native XSLTProcessor: common, math, sets,
 * strings, dates-and-times and dynamic.
 *
 * `../functions.js` merges this map into the XSLT function library, so the
 * functions are found by expanded name through any prefix bound to their
 * namespace and are reported by `function-available()`.
 *
 * Engine properties read at call time (all optional):
 * - `clock()`: returns the current instant as a Date (or any object with
 *   `getTime()` and `getTimezoneOffset()`), for deterministic dates;
 * - `enableDynamicEvaluate`: `true` enables `dyn:evaluate()`.
 */

"use strict";

import { createCommonFunctions } from "./common.js";
import { createDatesFunctions, systemClock } from "./dates.js";
import { createDynamicFunctions } from "./dynamic.js";
import { createMathFunctions } from "./math.js";
import { createSetsFunctions } from "./sets.js";
import { createStringsFunctions } from "./strings.js";

export {
  EXSLT_COMMON,
  EXSLT_DATES,
  EXSLT_DYNAMIC,
  EXSLT_MATH,
  EXSLT_SETS,
  EXSLT_STRINGS,
} from "./arguments.js";

/**
 * Build the EXSLT function map of an engine.
 *
 * @param {{xpathEvaluator: import('../../xpath/evaluator.js').XPathEvaluator, clock?: Function, enableDynamicEvaluate?: boolean}} engine - The engine
 * @returns {Object<string, Function>} Functions keyed by expanded name
 *
 * @example
 * evaluator.registerFunctions(createExsltFunctions(engine));
 */
export function createExsltFunctions(engine) {
  const evaluator = engine.xpathEvaluator;
  const clock = () =>
    typeof engine.clock === "function" ? engine.clock() : systemClock();

  return {
    ...createCommonFunctions(evaluator),
    ...createMathFunctions(evaluator),
    ...createSetsFunctions(evaluator),
    ...createStringsFunctions(evaluator),
    ...createDatesFunctions(evaluator, clock),
    ...createDynamicFunctions(
      evaluator,
      () => engine.enableDynamicEvaluate === true,
    ),
  };
}
