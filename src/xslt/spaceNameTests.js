/**
 * Name tests of `xsl:strip-space` and `xsl:preserve-space` (XSLT 1.0
 * section 3.4).
 *
 * The `elements` attribute lists XPath name tests: `*`, `prefix:*` or a
 * QName. The prefixes are expanded with the namespace declarations in scope
 * on the declaring element, and an unprefixed name only matches elements in
 * no namespace (XPath 1.0 section 2.3), so `p:*` matches by namespace URI
 * whatever prefix the source document uses. Name tests given as plain
 * strings (the {@link WhitespaceFilter} API before 1.2.0) are still matched
 * by their lexical name.
 *
 * @module xslt/spaceNameTests
 */

"use strict";

import { isQName } from "./qname.js";
import { splitQName } from "./resultNamespaces.js";
import { inScopeNamespaces, resolvePrefix } from "./stylesheetNamespaces.js";

/**
 * @typedef {Object} ElementNameTest
 * @property {string|null|undefined} namespaceUri - The namespace to match,
 *   null for no namespace, undefined for any (the `*` test)
 * @property {string} localName - The local name, `*` for any
 */

/**
 * Expand the name tests of an `elements` attribute.
 *
 * @param {string|null} value - Whitespace separated name tests
 * @param {Element} element - The xsl:strip-space or xsl:preserve-space element
 * @param {(message: string) => void} warn - Reports a skipped name test
 * @returns {ElementNameTest[]} The expanded name tests
 *
 * @example
 * // <xsl:strip-space xmlns:m="urn:m" elements="m:* p *"/>
 * compileSpaceNameTests("m:* p *", element, console.warn);
 * // [{ namespaceUri: "urn:m", localName: "*" },
 * //  { namespaceUri: null, localName: "p" },
 * //  { namespaceUri: undefined, localName: "*" }]
 */
export function compileSpaceNameTests(value, element, warn) {
  const tests = [];
  for (const token of (value ?? "").split(/[ \t\r\n]+/).filter(Boolean)) {
    if (token === "*") {
      tests.push({ namespaceUri: undefined, localName: "*" });
      continue;
    }
    const { prefix, localName } = splitQName(token);
    const qname = localName === "*" ? `${prefix}:x` : token;
    const namespaceUri = prefix
      ? resolvePrefix(inScopeNamespaces(element), prefix)
      : null;
    if (!isQName(qname) || (prefix && !namespaceUri)) {
      warn(
        `xsl:${element.localName} elements: "${token}" is not a name test with a declared prefix and is ignored`,
      );
      continue;
    }
    tests.push({ namespaceUri, localName });
  }
  return tests;
}

/**
 * The XSLT default priority of an element name test (section 5.5).
 *
 * @param {string|ElementNameTest} nameTest - A name test
 * @returns {number} -0.5 for `*`, -0.25 for `prefix:*`, 0 for a name
 */
export function nameTestPriority(nameTest) {
  if (typeof nameTest === "string") {
    if (nameTest === "*") return -0.5;
    return nameTest.endsWith(":*") ? -0.25 : 0;
  }
  if (nameTest.namespaceUri === undefined) return -0.5;
  return nameTest.localName === "*" ? -0.25 : 0;
}

/**
 * Whether an element matches a lexical name test (the string API).
 *
 * @param {Element} element - The element to test
 * @param {string} nameTest - `*`, `prefix:*` or a name
 * @returns {boolean} True when the element matches
 */
function matchesLexicalTest(element, nameTest) {
  if (nameTest === "*") return true;
  if (nameTest.endsWith(":*")) {
    return element.nodeName.startsWith(`${nameTest.slice(0, -2)}:`);
  }
  return element.nodeName === nameTest || element.localName === nameTest;
}

/**
 * Whether an element matches a name test.
 *
 * @param {Element} element - The element to test
 * @param {string|ElementNameTest} nameTest - A name test
 * @returns {boolean} True when the element matches
 *
 * @example
 * matchesNameTest(pElement, { namespaceUri: null, localName: "p" }); // true
 */
export function matchesNameTest(element, nameTest) {
  if (typeof nameTest === "string") {
    return matchesLexicalTest(element, nameTest);
  }
  const { namespaceUri, localName } = nameTest;
  if (namespaceUri === undefined) return true;
  if ((element.namespaceURI || null) !== namespaceUri) return false;
  return localName === "*" || element.localName === localName;
}
