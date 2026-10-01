/**
 * Catalog model of the xslt30-test suite (XSLT 3.0, 2.0 and 1.0 tests run
 * by a 3.0 processor): `catalog.xml` listing the test sets, and each test
 * set file with its environments and test cases.
 *
 * @module test-suites/lib/xsltCatalog
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseResult } from "./assertionModel.mjs";
import {
  parseEnvironment,
  parseModule,
  parseParam,
  resolveEnvironment,
} from "./environment.mjs";
import {
  attr,
  boolAttr,
  childElements,
  decodeXml,
  firstChild,
  parseXml,
} from "./xmlUtil.mjs";

/**
 * @typedef {object} XsltInvocation
 * @property {import('./environment.mjs').StylesheetModule[]} stylesheets -
 *   Stylesheets of the test (the environment's are used when empty)
 * @property {import('./environment.mjs').StylesheetModule[]} packages - Packages
 * @property {object[]} params - Global stylesheet parameters
 * @property {{name?: string, params: object[]}} [initialTemplate] - Entry
 * @property {{name?: string, select?: string, params: object[]}} [initialMode]
 * @property {{name: string, params: object[]}} [initialFunction] - Entry
 * @property {Record<string, string>} [output] - `<output>` attributes
 * @property {boolean} postureAndSweep - A static streamability analysis test
 */

/**
 * Read the children of a `<dependencies>` element: each child's name is the
 * dependency type.
 *
 * @param {Element} element - Test set or test case element
 * @returns {import('./qt3Catalog.mjs').Dependency[]} Dependencies
 */
export function parseXsltDependencies(element) {
  const container = firstChild(element, "dependencies");
  if (!container) return [];
  return childElements(container).map((el) => ({
    type: el.localName,
    value: (attr(el, "value") ?? "true").trim(),
    satisfied: boolAttr(el, "satisfied", true),
  }));
}

/**
 * Read an entry point element with its `<param>` children.
 *
 * @param {Element|undefined} element - `initial-template`, `initial-mode` or
 *   `initial-function`
 * @returns {object|undefined} `{name, select, params}`
 */
function parseEntry(element) {
  if (!element) return undefined;
  return {
    name: expandedName(element, attr(element, "name")),
    select: attr(element, "select"),
    params: childElements(element, "param").map(parseNamedParam),
  };
}

/**
 * Read a `<param>` element, its name as an EQName.
 *
 * @param {Element} param - The element
 * @returns {object} See environment.parseParam
 */
function parseNamedParam(param) {
  return {
    ...parseParam(param),
    name: expandedName(param, attr(param, "name")),
  };
}

/**
 * A prefixed name of the catalog as an EQName, `Q{uri}local`, resolved
 * with the namespaces in scope on its element (unprefixed names as is).
 *
 * @param {Element} element - Element on which the name is written
 * @param {string|undefined} name - The name
 * @returns {string|undefined} The name
 */
export function expandedName(element, name) {
  const colon = name?.indexOf(":") ?? -1;
  if (colon < 0 || name.startsWith("Q{")) return name;
  const uri = element.lookupNamespaceURI(name.slice(0, colon));
  return uri === null ? name : `Q{${uri}}${name.slice(colon + 1)}`;
}

/**
 * Read the `<test>` element of a test case.
 *
 * @param {Element|undefined} test - The element
 * @param {string} baseDir - Directory of the test set file
 * @returns {XsltInvocation} The invocation
 */
export function parseInvocation(test, baseDir) {
  if (!test) {
    return {
      stylesheets: [],
      packages: [],
      params: [],
      postureAndSweep: false,
    };
  }
  const output = firstChild(test, "output");
  const outputAttributes = {};
  if (output) {
    for (const name of [
      "file",
      "serialize",
      "tree",
      "well-formed",
      "result-var",
    ]) {
      const value = attr(output, name);
      if (value !== undefined) outputAttributes[name] = value;
    }
  }
  return {
    stylesheets: childElements(test, "stylesheet").map((el) =>
      parseModule(el, baseDir),
    ),
    packages: childElements(test, "package").map((el) =>
      parseModule(el, baseDir),
    ),
    params: childElements(test, "param").map(parseNamedParam),
    initialTemplate: parseEntry(firstChild(test, "initial-template")),
    initialMode: parseEntry(firstChild(test, "initial-mode")),
    initialFunction: parseEntry(firstChild(test, "initial-function")),
    output: output ? outputAttributes : undefined,
    postureAndSweep: firstChild(test, "posture-and-sweep") !== undefined,
  };
}

/**
 * Parse `catalog.xml`.
 *
 * @param {string} text - Catalog XML
 * @param {string} dir - Suite root directory
 * @returns {{testSets: {name: string, file: string}[]}} The catalog
 */
export function parseXsltCatalog(text, dir) {
  const root = parseXml(text, "catalog.xml").documentElement;
  return {
    testSets: childElements(root, "test-set").map((el) => ({
      name: attr(el, "name"),
      file: join(dir, attr(el, "file")),
    })),
  };
}

/**
 * Parse a test set file.
 *
 * @param {string} text - Test set XML
 * @param {string} file - Absolute path of the file
 * @param {string} [family] - Group of the test set (directory under tests/)
 * @returns {object} `{name, file, family, dependencies, testCases}`
 */
export function parseXsltTestSet(text, file, family = "") {
  const root = parseXml(text, file).documentElement;
  const baseDir = dirname(file);
  const name = attr(root, "name");
  const local = new Map();
  for (const el of childElements(root, "environment")) {
    const environment = parseEnvironment(el, baseDir);
    if (environment.name !== undefined) {
      local.set(environment.name, environment);
    }
  }
  const testCases = childElements(root, "test-case").map((el) => {
    const caseName = attr(el, "name");
    const envElement = firstChild(el, "environment");
    const testCase = {
      id: `${name}/${caseName}`,
      name: caseName,
      testSet: name,
      description: firstChild(el, "description")?.textContent.trim() ?? "",
      dependencies: parseXsltDependencies(el),
      environment: null,
      test: parseInvocation(firstChild(el, "test"), baseDir),
      result: parseResult(firstChild(el, "result"), baseDir),
    };
    try {
      const inline = envElement && parseEnvironment(envElement, baseDir);
      testCase.environment = resolveEnvironment(inline, local, new Map());
    } catch (error) {
      testCase.environmentError = error.message;
    }
    return testCase;
  });
  return {
    name,
    file,
    family,
    dependencies: parseXsltDependencies(root),
    testCases,
  };
}

/**
 * Load the catalog and every test set of an extracted xslt30-test suite.
 *
 * @param {string} dir - Suite root directory
 * @returns {{catalog: object, testSets: object[]}} The suite
 */
export function loadXsltSuite(dir) {
  const read = (path) => decodeXml(readFileSync(path));
  const catalog = parseXsltCatalog(read(join(dir, "catalog.xml")), dir);
  const testSets = catalog.testSets.map((entry) => {
    const family = entry.file.slice(dir.length + 1).split("/")[1] ?? "";
    return parseXsltTestSet(read(entry.file), entry.file, family);
  });
  return { catalog, testSets };
}
