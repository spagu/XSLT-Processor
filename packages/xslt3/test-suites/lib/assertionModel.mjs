/**
 * Expected results of a test case, read from a `<result>` element of either
 * catalog (qt3tests and xslt30-test share the assertion vocabulary).
 *
 * @module test-suites/lib/assertionModel
 */

import { join } from "node:path";
import { attr, boolAttr, childElements } from "./xmlUtil.mjs";

/**
 * @typedef {object} Assertion
 * @property {string} kind - Element name, e.g. "assert-eq" or "any-of"
 * @property {string} value - Text content (expression, expected value, XML)
 * @property {string} [file] - Absolute path of an expected-result file
 * @property {string} [code] - Error code of `error` and
 *   `assert-serialization-error` (`*` matches any)
 * @property {string} [flags] - Regex flags of `serialization-matches`
 * @property {boolean} [ignorePrefixes] - Of `assert-xml`
 * @property {boolean} [normalizeSpace] - Of `assert-string-value`
 * @property {string} [method] - Serialization method of `assert-serialization`
 * @property {string} [uri] - Of `assert-result-document`
 * @property {{prefix: string, uri: string}[]} [namespaces] - Prefixes in
 *   scope of an xslt30-test `assert`
 * @property {Assertion[]} children - Nested assertions of `any-of`, `all-of`,
 *   `not`, `assert-message` and `assert-result-document`
 */

/** Namespace of the xslt30-test catalog. */
export const XSLT_CATALOG_NAMESPACE =
  "http://www.w3.org/2012/10/xslt-test-catalog";

/** Assertion kinds whose element children are assertions themselves. */
export const COMPOSITE_KINDS = new Set([
  "any-of",
  "all-of",
  "not",
  "assert-message",
  "assert-result-document",
]);

/**
 * The prefixed namespaces in scope on an element of a catalog.
 *
 * @param {Element} element - The element
 * @returns {{prefix: string, uri: string}[]} The namespaces, the innermost
 *   declaration of each prefix
 */
export function declaredPrefixes(element) {
  const found = new Map();
  for (let node = element; node?.nodeType === 1; node = node.parentNode) {
    for (const attribute of [...node.attributes]) {
      const prefix = attribute.name.startsWith("xmlns:")
        ? attribute.name.slice(6)
        : null;
      if (prefix && !found.has(prefix)) found.set(prefix, attribute.value);
    }
  }
  return [...found].map(([prefix, uri]) => ({ prefix, uri }));
}

/**
 * Read one assertion element.
 *
 * @param {Element} element - Assertion element
 * @param {string} baseDir - Directory that `file` attributes are relative to
 * @returns {Assertion} The assertion
 */
export function parseAssertion(element, baseDir) {
  const kind = element.localName;
  const composite = COMPOSITE_KINDS.has(kind);
  /** @type {Assertion} */
  const assertion = {
    kind,
    value: composite ? "" : element.textContent,
    children: composite
      ? childElements(element).map((child) => parseAssertion(child, baseDir))
      : [],
  };
  const file = attr(element, "file");
  if (file !== undefined) assertion.file = join(baseDir, file);
  for (const name of ["code", "flags", "method", "uri"]) {
    const value = attr(element, name);
    if (value !== undefined) assertion[name] = value;
  }
  if (kind === "assert-xml" || kind === "assert-serialization") {
    assertion.ignorePrefixes = boolAttr(element, "ignore-prefixes");
  }
  if (kind === "assert" && element.namespaceURI === XSLT_CATALOG_NAMESPACE) {
    // xslt30-test assertions use the prefixes declared in the catalog
    assertion.namespaces = declaredPrefixes(element);
  }
  if (kind === "assert-string-value") {
    // the xslt30-test runner (runner/assert.xsl) always normalizes space
    assertion.normalizeSpace =
      boolAttr(element, "normalize-space") ||
      element.namespaceURI === XSLT_CATALOG_NAMESPACE;
  }
  return assertion;
}

/**
 * Read the `<result>` element of a test case: its single child assertion.
 *
 * @param {Element|undefined} result - The `<result>` element
 * @param {string} baseDir - Directory that `file` attributes are relative to
 * @returns {Assertion|null} The assertion, null when there is none
 */
export function parseResult(result, baseDir) {
  const [first] = result ? childElements(result) : [];
  return first ? parseAssertion(first, baseDir) : null;
}

/**
 * What a result expects as an outcome: the error codes that make it pass
 * and whether a non-error result can make it pass. Only the top level and
 * `any-of` alternatives are looked at (a `not` or `all-of` around `error`
 * cannot be satisfied by an error alone).
 *
 * @param {Assertion|null} assertion - Expected result
 * @returns {{errorCodes: string[], acceptsValue: boolean}} The expectation
 */
export function expectedOutcome(assertion) {
  const errorCodes = [];
  let acceptsValue = false;
  const visit = (node) => {
    if (node.kind === "error") errorCodes.push(node.code ?? "*");
    else if (node.kind === "any-of") node.children.forEach(visit);
    else acceptsValue = true;
  };
  if (assertion) visit(assertion);
  else acceptsValue = true;
  return { errorCodes, acceptsValue };
}
