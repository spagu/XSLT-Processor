/**
 * The function modules of F&O 3.1 that need no evaluator, collected for
 * the function registry. fn:concat, fn:string-join and fn:string-length
 * are exported separately (`coreStringFunctions`) because the core library
 * may define them.
 *
 * @module @tradik/xslt3/functions/library
 */

import { aggregateFunctions } from "./aggregates.js";
import { dateTimeFunctions } from "./datetime.js";
import { formatDateTimeFunctions } from "./format/formatDateTime.js";
import { formatIntegerFunctions } from "./format/formatInteger.js";
import { formatNumberFunctions } from "./format/formatNumber.js";
import { mathFunctions } from "./math.js";
import { numericFunctions } from "./numeric.js";
import { parseIetfDateFunctions } from "./parseIetfDate.js";
import { qnameFunctions } from "./qnames.js";
import { analyzeStringFunctions } from "./regex/analyzeString.js";
import { regexFunctions } from "./regex/regexFunctions.js";
import { sequenceFunctions } from "./sequences.js";
import { serializeFunctions } from "./serializeFunction.js";
import { stringFunctions } from "./strings.js";
import { stringMatchFunctions } from "./stringMatch.js";
import { uriFunctions } from "./uri.js";

export { coreStringFunctions } from "./stringsCore.js";

/** @type {import("./support.js").FunctionDefinition[]} */
export const libraryFunctions = [
  ...stringFunctions,
  ...stringMatchFunctions,
  ...uriFunctions,
  ...regexFunctions,
  ...analyzeStringFunctions,
  ...numericFunctions,
  ...formatIntegerFunctions,
  ...formatNumberFunctions,
  ...mathFunctions,
  ...dateTimeFunctions,
  ...formatDateTimeFunctions,
  ...parseIetfDateFunctions,
  ...qnameFunctions,
  ...sequenceFunctions,
  ...aggregateFunctions,
  ...serializeFunctions,
];
