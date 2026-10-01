/**
 * Catalog model of the qt3tests suite (XPath/XQuery 3.1 and Functions and
 * Operators): `catalog.xml` with shared environments and the test sets, and
 * each test set file with its test cases.
 *
 * @module test-suites/lib/qt3Catalog
 */

import { dirname, join } from "node:path";
import { parseResult } from "./assertionModel.mjs";
import { parseEnvironment, resolveEnvironment } from "./environment.mjs";
import {
  attr,
  boolAttr,
  childElements,
  decodeXml,
  firstChild,
  parseXml,
} from "./xmlUtil.mjs";
import { readFileSync } from "node:fs";

/**
 * @typedef {object} Dependency
 * @property {string} type - e.g. "spec", "feature", "xml-version"
 * @property {string} value - e.g. "XP31+ XQ31+" or "higherOrderFunctions"
 * @property {boolean} satisfied - false when the test needs the dependency
 *   to be absent
 */

/**
 * @typedef {object} Qt3TestCase
 * @property {string} id - "test-set/test-case"
 * @property {string} name - Test case name
 * @property {string} testSet - Test set name
 * @property {string} description - Description text
 * @property {Dependency[]} dependencies - Own dependencies
 * @property {import('./environment.mjs').Environment|null} environment -
 *   Resolved environment
 * @property {string} [environmentError] - Why the environment did not resolve
 * @property {{text: string, file?: string}} test - The expression (inline
 *   text, or the absolute path of a query file)
 * @property {boolean} hasModules - Whether the test imports XQuery modules
 * @property {import('./assertionModel.mjs').Assertion|null} result - Expected
 */

/**
 * Read the `<dependency>` children of an element.
 *
 * @param {Element} element - Test set or test case element
 * @returns {Dependency[]} Dependencies
 */
export function parseQt3Dependencies(element) {
  return childElements(element, "dependency").map((el) => ({
    type: attr(el, "type") ?? "",
    value: (attr(el, "value") ?? "").trim(),
    satisfied: boolAttr(el, "satisfied", true),
  }));
}

/**
 * Index named environments by name.
 *
 * @param {Element} element - Catalog or test set element
 * @param {string} baseDir - Directory of the file
 * @returns {Map<string, import('./environment.mjs').Environment>} By name
 */
function namedEnvironments(element, baseDir) {
  const result = new Map();
  for (const el of childElements(element, "environment")) {
    const environment = parseEnvironment(el, baseDir);
    if (environment.name !== undefined) {
      result.set(environment.name, environment);
    }
  }
  return result;
}

/**
 * Parse `catalog.xml`.
 *
 * @param {string} text - Catalog XML
 * @param {string} dir - Suite root directory
 * @returns {{version: string, environments: Map<string, object>,
 *   testSets: {name: string, file: string}[]}} The catalog
 */
export function parseQt3Catalog(text, dir) {
  const root = parseXml(text, "catalog.xml").documentElement;
  return {
    version: attr(root, "version") ?? "",
    environments: namedEnvironments(root, dir),
    testSets: childElements(root, "test-set").map((el) => ({
      name: attr(el, "name"),
      file: join(dir, attr(el, "file")),
    })),
  };
}

/**
 * Read one test case.
 *
 * @param {Element} element - `<test-case>` element
 * @param {string} setName - Test set name
 * @param {string} baseDir - Directory of the test set file
 * @param {(env: object|undefined) => object|null} resolve - Environment resolver
 * @returns {Qt3TestCase} The test case
 */
function parseTestCase(element, setName, baseDir, resolve) {
  const name = attr(element, "name");
  const test = firstChild(element, "test");
  const envElement = firstChild(element, "environment");
  const testCase = {
    id: `${setName}/${name}`,
    name,
    testSet: setName,
    description: firstChild(element, "description")?.textContent.trim() ?? "",
    dependencies: parseQt3Dependencies(element),
    environment: null,
    test: { text: test?.textContent ?? "" },
    hasModules: childElements(element, "module").length > 0,
    result: parseResult(firstChild(element, "result"), baseDir),
  };
  const file = test ? attr(test, "file") : undefined;
  if (file !== undefined) testCase.test.file = join(baseDir, file);
  try {
    testCase.environment = resolve(
      envElement && parseEnvironment(envElement, baseDir),
    );
  } catch (error) {
    testCase.environmentError = error.message;
  }
  return testCase;
}

/**
 * Parse a test set file.
 *
 * @param {string} text - Test set XML
 * @param {string} file - Absolute path of the file
 * @param {Map<string, object>} [shared] - Catalog environments
 * @returns {{name: string, file: string, family: string,
 *   dependencies: Dependency[], testCases: Qt3TestCase[]}} The test set;
 *   the family is the name prefix ("fn", "op", "prod", ...)
 */
export function parseQt3TestSet(text, file, shared = new Map()) {
  const root = parseXml(text, file).documentElement;
  const baseDir = dirname(file);
  const name = attr(root, "name");
  const local = namedEnvironments(root, baseDir);
  const resolve = (env) => resolveEnvironment(env, local, shared);
  return {
    name,
    file,
    family: name.split("-")[0],
    dependencies: parseQt3Dependencies(root),
    testCases: childElements(root, "test-case").map((el) =>
      parseTestCase(el, name, baseDir, resolve),
    ),
  };
}

/**
 * Load the catalog and every test set of an extracted qt3tests suite.
 *
 * @param {string} dir - Suite root directory
 * @returns {{catalog: object, testSets: object[]}} The suite
 */
export function loadQt3Suite(dir) {
  const read = (path) => decodeXml(readFileSync(path));
  const catalog = parseQt3Catalog(read(join(dir, "catalog.xml")), dir);
  const testSets = catalog.testSets.map((entry) =>
    parseQt3TestSet(read(entry.file), entry.file, catalog.environments),
  );
  return { catalog, testSets };
}
