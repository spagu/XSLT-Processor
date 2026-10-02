/**
 * Verdict of the parse-only stage of qt3tests: the expression is only
 * parsed, so a test can be decided only as far as parsing goes.
 *
 * - A test expecting XPST0003 (syntax error) passes when parsing raises it,
 *   and fails when parsing succeeds and no other outcome is allowed.
 * - A test that allows a result passes when parsing succeeds.
 * - A test expecting only dynamic or type errors passes when parsing
 *   succeeds (they are raised later); one expecting other static errors
 *   (XPST0008, XPST0017, ...) passes when parsing raises that error and is
 *   "not-run" when parsing succeeds (static analysis decides it later).
 *
 * @module test-suites/lib/parseStage
 */

import { expectedOutcome } from "./assertionModel.mjs";
import { errorCodeMatches, errorLocalName } from "./assertionText.mjs";

/** Error code of syntax errors. */
export const SYNTAX_ERROR = "XPST0003";

/**
 * Whether an error code is a static error (XPST, XQST).
 *
 * @param {string} code - Error code
 * @returns {boolean} True for static errors
 */
export function isStaticError(code) {
  return /^X[PQ]ST/.test(errorLocalName(code));
}

/**
 * Decide the parse stage of a test.
 *
 * @param {import('./assertionModel.mjs').Assertion|null} assertion - Expected
 * @param {{error?: {code?: string, message?: string}}} parse - Outcome of
 *   parsing: `error` set when the parser threw
 * @returns {{status: string, reason: string}} The verdict
 */
export function classifyParse(assertion, parse) {
  const { errorCodes, acceptsValue } = expectedOutcome(assertion);
  if (parse.error) {
    const code = parse.error.code;
    if (!code) {
      return {
        status: "fail",
        reason: `parser crashed: ${parse.error.message}`,
      };
    }
    if (errorCodes.some((expected) => errorCodeMatches(expected, code))) {
      return { status: "pass", reason: "" };
    }
    if (acceptsValue) {
      return {
        status: "fail",
        reason: `rejected a valid expression: ${code} ${parse.error.message}`,
      };
    }
    return {
      status: "error-mismatch",
      reason: `expected ${errorCodes.join(" or ")}, got ${code}`,
    };
  }
  if (acceptsValue || errorCodes.includes("*")) {
    return { status: "pass", reason: "" };
  }
  if (errorCodes.some((code) => errorLocalName(code) === SYNTAX_ERROR)) {
    return {
      status: "fail",
      reason: `expected ${SYNTAX_ERROR}, parsing succeeded`,
    };
  }
  if (errorCodes.every((code) => !isStaticError(code))) {
    return { status: "pass", reason: "" };
  }
  return {
    status: "not-run",
    reason: `needs static analysis: ${errorCodes.join(" or ")}`,
  };
}
