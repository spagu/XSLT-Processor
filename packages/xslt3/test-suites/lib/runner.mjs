/**
 * Running the test cases of a loaded suite with an engine adapter.
 *
 * Every test case that passes the filter yields one result: "skipped" when
 * its dependencies or environment are not supported, else the verdict of
 * its run ("pass", "fail", "error-mismatch" or "not-run").
 *
 * @module test-suites/lib/runner
 */

import { readFileSync } from "node:fs";
import { createHelpers } from "./adapter.mjs";
import { NotRunError, checkAssertion } from "./assertions.mjs";
import { dynamicContext, staticContext } from "./context.mjs";
import { applicability } from "./dependencies.mjs";
import { classifyParse } from "./parseStage.mjs";
import { decodeXml } from "./xmlUtil.mjs";

/**
 * @typedef {object} TestResult
 * @property {string} id - "test-set/test-case"
 * @property {string} testSet - Test set name
 * @property {string} family - Test set family
 * @property {string} status - pass, fail, error-mismatch, not-run, skipped
 * @property {string} reason - Why, for anything but a pass
 */

/**
 * Compile a filter of `*` and `?` wildcards matched against the test set
 * name, the test case name and the id.
 *
 * @param {string} [pattern] - Pattern, e.g. "prod-*"
 * @returns {(testCase: object) => boolean} Predicate (all match when empty)
 */
export function compileFilter(pattern) {
  if (!pattern) return () => true;
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${source}$`);
  return (testCase) =>
    regex.test(testCase.testSet) ||
    regex.test(testCase.name) ||
    regex.test(testCase.id);
}

/**
 * Read a text file of the suite (query, expected result), honouring the
 * XML declaration's encoding for XML files.
 *
 * @param {string} path - Absolute path
 * @returns {string} File content
 */
export function readSuiteFile(path) {
  return decodeXml(readFileSync(path));
}

/**
 * Error thrown by an engine call, as an outcome.
 *
 * @param {Error} error - Thrown error
 * @returns {{error: {code?: string, message: string}}} The outcome
 */
function errorOutcome(error) {
  if (error instanceof NotRunError) throw error;
  return {
    error: { code: error?.code, message: String(error?.message ?? error) },
  };
}

/**
 * Run one qt3tests test case.
 *
 * @param {object} testCase - Test case
 * @param {object} adapter - Engine adapter
 * @param {boolean} parseOnly - Only parse the expression
 * @param {(path: string) => string} readFile - File reader
 * @returns {{status: string, reason: string}} The verdict
 */
export function runQt3Case(testCase, adapter, parseOnly, readFile) {
  const expression = testCase.test.file
    ? readFile(testCase.test.file)
    : testCase.test.text;
  const environment = testCase.environment;
  if (parseOnly) {
    if (!adapter.parse) {
      return { status: "not-run", reason: "adapter has no parse" };
    }
    let parse = {};
    try {
      adapter.parse(expression, staticContext(environment, testCase.baseUri));
    } catch (error) {
      parse = errorOutcome(error);
    }
    return classifyParse(testCase.result, parse);
  }
  if (!adapter.evaluateXPath) {
    return { status: "not-run", reason: "adapter has no evaluateXPath" };
  }
  let outcome;
  try {
    const context = dynamicContext(environment, adapter, testCase.baseUri);
    outcome = { value: adapter.evaluateXPath(expression, context) };
  } catch (error) {
    outcome = errorOutcome(error);
  }
  const namespaces = environment?.namespaces ?? [];
  return checkAssertion(
    testCase.result,
    outcome,
    createHelpers(adapter, { namespaces, readFile }),
  );
}

/**
 * Run one xslt30-test test case.
 *
 * @param {object} testCase - Test case
 * @param {object} adapter - Engine adapter
 * @param {(path: string) => string} readFile - File reader
 * @returns {{status: string, reason: string}} The verdict
 */
export function runXsltCase(testCase, adapter, readFile) {
  const { test } = testCase;
  if (test.postureAndSweep) {
    return { status: "not-run", reason: "static streamability analysis" };
  }
  if (!adapter.transform) {
    return { status: "not-run", reason: "adapter has no transform" };
  }
  const environment = testCase.environment;
  const stylesheet = {
    stylesheets: test.stylesheets.length
      ? test.stylesheets
      : (environment?.stylesheets ?? []),
    packages: [...(environment?.packages ?? []), ...test.packages],
  };
  const input = {
    environment,
    initialTemplate: test.initialTemplate,
    initialMode: test.initialMode,
    initialFunction: test.initialFunction,
    output: test.output,
  };
  const params = [...(environment?.params ?? []), ...test.params];
  let outcome;
  try {
    const result = adapter.transform(stylesheet, input, params);
    // <output serialize="yes"> with an expected error: the result is
    // serialized, and a serialization error is the outcome of the test
    if (
      test.output?.serialize === "yes" &&
      testCase.result?.kind === "error" &&
      adapter.serialize
    ) {
      adapter.serialize(result?.value, {});
    }
    outcome = {
      value: result?.value,
      messages: result?.messages ?? [],
      resultDocuments: result?.resultDocuments ?? new Map(),
    };
  } catch (error) {
    outcome = errorOutcome(error);
  }
  const helpers = createHelpers(adapter, { resultAsContext: true, readFile });
  return checkAssertion(testCase.result, outcome, helpers);
}

/**
 * Run one test case of either suite, turning a missing capability into a
 * "not-run" verdict and any other failure of the harness into "fail".
 *
 * @param {object} testCase - Test case
 * @param {object} options - Options
 * @param {"qt3"|"xslt30"} options.kind - Suite kind
 * @param {object} options.adapter - Engine adapter
 * @param {boolean} [options.parseOnly] - qt3: only parse
 * @param {(path: string) => string} [options.readFile] - File reader
 * @returns {{status: string, reason: string}} The verdict
 */
export function runCase(testCase, options) {
  const {
    kind,
    adapter,
    parseOnly = false,
    readFile = readSuiteFile,
  } = options;
  try {
    return kind === "qt3"
      ? runQt3Case(testCase, adapter, parseOnly, readFile)
      : runXsltCase(testCase, adapter, readFile);
  } catch (error) {
    const status = error instanceof NotRunError ? "not-run" : "fail";
    return { status, reason: error.message };
  }
}

/**
 * Run the test cases of a suite.
 *
 * @param {{testSets: object[]}} suite - Loaded suite
 * @param {object} options - Options
 * @param {"qt3"|"xslt30"} options.kind - Suite kind
 * @param {object} options.adapter - Engine adapter
 * @param {import('./dependencies.mjs').SuiteConfig} options.config - Config
 * @param {boolean} [options.parseOnly] - qt3: only parse
 * @param {string} [options.filter] - Wildcard filter
 * @param {(path: string) => string} [options.readFile] - File reader
 * @param {(testCase: object) => {status: string, reason: string}} [options.runCase]
 *   - Runs an applicable test case (default: {@link runCase} in this
 *   thread; see isolation.mjs for worker threads with a time limit)
 * @returns {TestResult[]} One result per test case passing the filter
 */
export function runSuite(suite, options) {
  const { config } = options;
  const run = options.runCase ?? ((testCase) => runCase(testCase, options));
  const matches = compileFilter(options.filter);
  const results = [];
  for (const testSet of suite.testSets) {
    for (const testCase of testSet.testCases) {
      if (!matches(testCase)) continue;
      const base = {
        id: testCase.id,
        testSet: testSet.name,
        family: testSet.family,
      };
      const decision = applicability(testCase, testSet.dependencies, config);
      let verdict;
      if (!decision.applicable) {
        verdict = { status: "skipped", reason: decision.reason };
      } else if (testCase.environmentError) {
        verdict = { status: "not-run", reason: testCase.environmentError };
      } else {
        verdict = run(testCase);
      }
      results.push({ ...base, ...verdict });
    }
  }
  return results;
}
