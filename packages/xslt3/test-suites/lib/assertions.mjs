/**
 * Checking the outcome of a test against its expected result.
 *
 * Statuses: "pass"; "fail"; "error-mismatch" (an error was expected and a
 * different one was raised, which the W3C reports count apart); "not-run"
 * (the engine adapter lacks what the assertion needs).
 *
 * @module test-suites/lib/assertions
 */

import {
  assertionExpression,
  errorCodeMatches,
  serializationEquals,
  serializationMatches,
  stringValueMatches,
} from "./assertionText.mjs";
import { xmlDifference } from "./xmlCompare.mjs";

/**
 * @typedef {object} Outcome
 * @property {*} [value] - Result of a successful evaluation or transformation
 * @property {{code?: string, message?: string}} [error] - Raised error
 * @property {*[]} [messages] - Values of `xsl:message` (xslt30-test)
 * @property {Map<string, *>} [resultDocuments] - Secondary results by URI
 */

/**
 * @typedef {object} Helpers
 * @property {(expr: string, value: *) => boolean} test - Evaluate an
 *   expression returning xs:boolean with `$result` bound to the value
 * @property {(value: *) => string} stringValue - Space separated string value
 * @property {(value: *, params: object) => string} serialize - Serialize
 * @property {(path: string) => string} readFile - Read an expected-result file
 */

/** @typedef {{status: string, reason: string}} Verdict */

/** Error thrown by a helper whose capability the adapter does not have. */
export class NotRunError extends Error {}

const verdict = (status, reason = "") => ({ status, reason });

/** Precedence of statuses when alternatives are combined (best first). */
const RANK = ["pass", "error-mismatch", "not-run", "fail"];

/**
 * Check an `error` assertion.
 *
 * @param {import('./assertionModel.mjs').Assertion} assertion - Assertion
 * @param {Outcome} outcome - Outcome
 * @returns {Verdict} The verdict
 */
function checkError(assertion, outcome) {
  const expected = assertion.code ?? "*";
  if (!outcome.error) {
    return verdict("fail", `expected error ${expected}, got a result`);
  }
  if (errorCodeMatches(expected, outcome.error.code)) return verdict("pass");
  return verdict(
    "error-mismatch",
    `expected ${expected}, got ${outcome.error.code}`,
  );
}

/**
 * Check an assertion on a value (the outcome is not an error).
 *
 * @param {import('./assertionModel.mjs').Assertion} assertion - Assertion
 * @param {*} value - Result value
 * @param {Helpers} helpers - Engine helpers
 * @returns {Verdict} The verdict
 */
function checkValue(assertion, value, helpers) {
  const expected = () =>
    assertion.file ? helpers.readFile(assertion.file) : assertion.value;
  const expression = assertionExpression(assertion);
  if (expression !== null) {
    return helpers.test(expression, value, assertion.namespaces)
      ? verdict("pass")
      : verdict("fail", assertion.kind);
  }
  switch (assertion.kind) {
    case "assert-string-value": {
      const actual = helpers.stringValue(value);
      return stringValueMatches(actual, expected(), assertion.normalizeSpace)
        ? verdict("pass")
        : verdict("fail", `string value ${JSON.stringify(actual)}`);
    }
    case "assert-xml": {
      const params = { method: "xml", "omit-xml-declaration": true };
      const actual = helpers.serialize(value, params);
      const difference = xmlDifference(expected(), actual, assertion);
      return difference ? verdict("fail", difference) : verdict("pass");
    }
    case "assert-serialization":
    case "serialization-matches": {
      const actual = helpers.serialize(value, {
        method: assertion.method ?? "xml",
      });
      const ok =
        assertion.kind === "serialization-matches"
          ? serializationMatches(actual, expected(), assertion.flags)
          : serializationEquals(actual, expected());
      return ok
        ? verdict("pass")
        : verdict("fail", `serialized ${JSON.stringify(actual)}`);
    }
    case "assert-serialization-error":
      try {
        helpers.serialize(value, { method: assertion.method ?? "xml" });
      } catch (error) {
        if (error instanceof NotRunError) throw error;
        return checkError(assertion, { error });
      }
      return verdict("fail", `expected serialization error ${assertion.code}`);
    default:
      return verdict("not-run", `assertion ${assertion.kind} not supported`);
  }
}

/**
 * The result document with a URI: the one of that key, else (results are
 * keyed by absolute URIs once a base output URI is set) the one whose URI
 * ends with it.
 *
 * @param {Map<string, *>|undefined} documents - Result documents by URI
 * @param {string} uri - URI of the assertion, often relative
 * @returns {*} The document, undefined when there is none
 */
function resultDocument(documents, uri) {
  if (!documents) return undefined;
  if (documents.has(uri)) return documents.get(uri);
  for (const [key, document] of documents) {
    if (key.endsWith(`/${uri}`)) return document;
  }
  return undefined;
}

/**
 * Combine the verdicts of alternatives: the best one wins.
 *
 * @param {Verdict[]} verdicts - Verdicts
 * @returns {Verdict} The best verdict
 */
function best(verdicts) {
  return verdicts
    .slice(1)
    .reduce(
      (a, b) => (RANK.indexOf(b.status) < RANK.indexOf(a.status) ? b : a),
      verdicts[0],
    );
}

/**
 * Combine the verdicts of conjuncts: the worst one wins.
 *
 * @param {Verdict[]} verdicts - Verdicts
 * @returns {Verdict} The worst verdict, a pass when there are none
 */
function worst(verdicts) {
  return verdicts.reduce(
    (a, b) => (RANK.indexOf(b.status) > RANK.indexOf(a.status) ? b : a),
    verdict("pass"),
  );
}

/**
 * Check an outcome against an assertion.
 *
 * @param {import('./assertionModel.mjs').Assertion|null} assertion - Expected
 * @param {Outcome} outcome - What the engine produced
 * @param {Helpers} helpers - Engine helpers
 * @returns {Verdict} The verdict
 */
export function checkAssertion(assertion, outcome, helpers) {
  if (!assertion) return verdict("not-run", "no expected result");
  const { kind, children } = assertion;
  try {
    switch (kind) {
      case "error":
        return checkError(assertion, outcome);
      case "any-of":
        return best(
          children.map((child) => checkAssertion(child, outcome, helpers)),
        );
      case "all-of": {
        return worst(
          children.map((child) => checkAssertion(child, outcome, helpers)),
        );
      }
      case "not": {
        const inner = checkAssertion(children[0], outcome, helpers);
        if (inner.status === "not-run") return inner;
        return inner.status === "pass"
          ? verdict("fail", "not: inner assertion holds")
          : verdict("pass");
      }
      case "assert-message": {
        const all = { kind: "all-of", value: "", children };
        const verdicts = (outcome.messages ?? []).map((message) =>
          checkAssertion(all, { value: message }, helpers),
        );
        return verdicts.length
          ? best(verdicts)
          : verdict("fail", "no xsl:message output");
      }
      case "assert-result-document": {
        const document = resultDocument(outcome.resultDocuments, assertion.uri);
        if (document === undefined) {
          return verdict("fail", `no result document ${assertion.uri}`);
        }
        return checkAssertion(
          { kind: "all-of", value: "", children },
          { value: document },
          helpers,
        );
      }
      default:
        if (outcome.error) {
          return verdict(
            "fail",
            `unexpected error ${outcome.error.code ?? outcome.error.message}`,
          );
        }
        return checkValue(assertion, outcome.value, helpers);
    }
  } catch (error) {
    if (error instanceof NotRunError) return verdict("not-run", error.message);
    return verdict(
      "fail",
      `${kind}: ${error.code ?? ""} ${error.message}`.trim(),
    );
  }
}
