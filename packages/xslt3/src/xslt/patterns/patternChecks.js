/**
 * The grouping functions patterns cannot call (XTSE1060, XTSE1070).
 *
 * @module @tradik/xslt3/xslt/patterns/patternChecks
 */

import { xsltError } from "../names.js";

/** Functions a pattern cannot call (XTSE1060, XTSE1070). */
const GROUPING_CALLS = {
  "current-group": "XTSE1060",
  "current-grouping-key": "XTSE1070",
};

/**
 * Checks that a pattern does not call current-group() or
 * current-grouping-key().
 * @param {object} ast
 */
export function checkGroupingCalls(ast) {
  if (ast === null || typeof ast !== "object") return;
  if (ast.type === "FunctionCall" && !ast.name.prefix && !ast.name.uri) {
    const code = GROUPING_CALLS[ast.name.local];
    if (code) {
      throw xsltError(code, `A pattern cannot call ${ast.name.local}()`);
    }
  }
  for (const value of Object.values(ast)) checkGroupingCalls(value);
}
