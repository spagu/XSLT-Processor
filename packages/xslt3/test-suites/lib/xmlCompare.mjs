/**
 * XML comparison of `assert-xml`: the serialized result and the expected
 * XML (a document or a fragment) are parsed and compared node by node, as
 * the catalogs specify (deep equality of the trees; attribute order and
 * namespace declarations do not matter, prefixes only when
 * `ignore-prefixes` is false).
 *
 * @module test-suites/lib/xmlCompare
 */

import { parseXml } from "./xmlUtil.mjs";

const ELEMENT = 1;
const TEXT = 3;
const CDATA = 4;
const XMLNS = "http://www.w3.org/2000/xmlns/";

/**
 * Parse XML text that may be a fragment (several elements, or text) by
 * wrapping it in an element; an XML declaration and DOCTYPE are dropped.
 *
 * @param {string} text - XML text
 * @returns {Element} The wrapper element
 * @throws {Error} When the text is not a well-formed fragment
 */
export function parseFragment(text) {
  const body = text
    .replace(/^\uFEFF/, "")
    .replace(/^\s*<\?xml\s[^?]*\?>/, "")
    .replace(/^\s*<!DOCTYPE[^>[]*(\[[^\]]*\])?\s*>/, "");
  return parseXml(`<fragment-wrapper>${body}</fragment-wrapper>`, "assert-xml")
    .documentElement;
}

/**
 * Children to compare: adjacent text and CDATA merged, empty text dropped.
 *
 * @param {Node} node - Parent node
 * @returns {{type: number, node?: Node, text?: string}[]} Normalized children
 */
function normalizedChildren(node) {
  const result = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const isText = child.nodeType === TEXT || child.nodeType === CDATA;
    const last = result.at(-1);
    if (isText && last?.type === TEXT) last.text += child.nodeValue;
    else if (isText) result.push({ type: TEXT, text: child.nodeValue });
    else result.push({ type: child.nodeType, node: child });
  }
  return result.filter((entry) => entry.type !== TEXT || entry.text !== "");
}

/**
 * Attributes other than namespace declarations, keyed by expanded name.
 *
 * @param {Element} element - Element
 * @param {boolean} ignorePrefixes - Whether prefixes are left out of keys
 * @returns {Map<string, string>} Expanded (or prefixed) name to value
 */
function attributeMap(element, ignorePrefixes) {
  const result = new Map();
  for (let i = 0; i < element.attributes.length; i++) {
    const item = element.attributes.item(i);
    if (item.namespaceURI === XMLNS) continue;
    const prefix = ignorePrefixes || !item.prefix ? "" : `${item.prefix}:`;
    result.set(
      `{${item.namespaceURI ?? ""}}${prefix}${item.localName}`,
      item.value,
    );
  }
  return result;
}

/**
 * Compare two nodes; returns where they differ.
 *
 * @param {Node} expected - Expected node
 * @param {Node} actual - Actual node
 * @param {boolean} ignorePrefixes - Whether element and attribute prefixes
 *   may differ
 * @returns {string} Description of the first difference, "" when equal
 */
export function compareNodes(expected, actual, ignorePrefixes) {
  if (expected.nodeType !== actual.nodeType) return "node kinds differ";
  if (expected.nodeType === ELEMENT) {
    const sameName =
      expected.localName === actual.localName &&
      (expected.namespaceURI ?? "") === (actual.namespaceURI ?? "") &&
      (ignorePrefixes || (expected.prefix ?? "") === (actual.prefix ?? ""));
    if (!sameName) return `element ${expected.nodeName} vs ${actual.nodeName}`;
    const want = attributeMap(expected, ignorePrefixes);
    const got = attributeMap(actual, ignorePrefixes);
    if (
      want.size !== got.size ||
      [...want].some(([key, value]) => got.get(key) !== value)
    ) {
      return `attributes of ${expected.nodeName} differ`;
    }
  } else if (
    expected.nodeName !== actual.nodeName ||
    expected.nodeValue !== actual.nodeValue
  ) {
    return `${expected.nodeName} differs`;
  }
  return compareChildren(expected, actual, ignorePrefixes);
}

/**
 * Compare the normalized children of two nodes.
 *
 * @param {Node} expected - Expected parent
 * @param {Node} actual - Actual parent
 * @param {boolean} ignorePrefixes - See {@link compareNodes}
 * @returns {string} Description of the first difference, "" when equal
 */
function compareChildren(expected, actual, ignorePrefixes) {
  const want = normalizedChildren(expected);
  const got = normalizedChildren(actual);
  if (want.length !== got.length) {
    return `${expected.nodeName}: ${want.length} children expected, got ${got.length}`;
  }
  for (let i = 0; i < want.length; i++) {
    if (want[i].type !== got[i].type) {
      return `${expected.nodeName}: child ${i + 1} kind differs`;
    }
    const difference =
      want[i].type === TEXT
        ? want[i].text === got[i].text
          ? ""
          : `text ${JSON.stringify(want[i].text)} vs ${JSON.stringify(got[i].text)}`
        : compareNodes(want[i].node, got[i].node, ignorePrefixes);
    if (difference) return difference;
  }
  return "";
}

/**
 * Whether two XML texts (documents or fragments) are equal for `assert-xml`.
 *
 * @param {string} expected - Expected XML
 * @param {string} actual - Serialized result
 * @param {object} [options] - Options
 * @param {boolean} [options.ignorePrefixes] - Prefixes may differ
 * @returns {string} Description of the first difference, "" when equal
 */
export function xmlDifference(
  expected,
  actual,
  { ignorePrefixes = false } = {},
) {
  let want;
  let got;
  try {
    want = parseFragment(expected);
  } catch (error) {
    return `expected XML is not well-formed: ${error.message}`;
  }
  try {
    got = parseFragment(actual);
  } catch (error) {
    return `result is not well-formed: ${error.message}`;
  }
  return compareChildren(want, got, ignorePrefixes);
}
