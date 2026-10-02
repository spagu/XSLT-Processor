/**
 * Output comparison: parses both results with the same parser and compares
 * the trees, so that attribute order, the XML declaration, indentation
 * between elements, trailing whitespace and the `<meta>` charset element
 * libxml2 adds do not count. Pure: the parser comes from the caller
 * (./dom.js wraps jsdom).
 *
 * @module xslt-migrate-check/compat/compare
 */

import { readAttribute } from "../detectors.js";
import {
  WRAPPER,
  describeNode,
  nodeName,
  significantChildren,
  stepOf,
} from "./nodes.js";

/**
 * @typedef {object} DomTools
 * @property {(text: string, method: "xml"|"html") => Document|null} parse -
 *   Parse an output; null when it is not well-formed
 * @property {(node: Node) => string} serialize - Serialize a node
 */

/**
 * @typedef {object} Comparison
 * @property {"MATCH"|"DIFFERENT"} status - The outcome
 * @property {string} [path] - XPath of the first differing node
 * @property {string} [expected] - The reference's side of it (≤ 3 lines)
 * @property {string} [actual] - Tradik's side of it (≤ 3 lines)
 */

const OUTPUT_PATTERN = /<xsl:output\b([^>]*)>/;
const HTML_ROOT = /^(?:<!DOCTYPE[^>]*>\s*)?<html[\s>]/i;
const XML_DECLARATION = /^<\?xml\s[^?]*\?>/;

/**
 * The output method of a transformation: xsl:output's, else html when the
 * result starts with an `<html>` element (XSLT 1.0 section 16), else xml.
 *
 * @param {string} xslText - The stylesheet
 * @param {string} output - A result
 * @returns {"xml"|"html"|"text"} The method
 */
export function outputMethod(xslText, output) {
  const attributes = OUTPUT_PATTERN.exec(xslText)?.[1] ?? "";
  const method = readAttribute(attributes, "method")?.toLowerCase();
  if (method === "html" || method === "text" || method === "xml") {
    return method;
  }
  if (method === "xhtml") return "xml";
  return HTML_ROOT.test(normalizeOutput(output)) ? "html" : "xml";
}

/**
 * Remove what never counts: CR before LF, the XML declaration, leading
 * and trailing whitespace.
 *
 * @param {string} text - A result
 * @returns {string} The normalized text
 */
export function normalizeOutput(text) {
  return text
    .replaceAll("\r\n", "\n")
    .trim()
    .replace(XML_DECLARATION, "")
    .trim();
}

/**
 * Cut a snippet to three lines.
 *
 * @param {string} text - The snippet
 * @returns {string} At most three lines, "…" when cut
 */
export function snippet(text) {
  const lines = text.split("\n");
  return lines.length > 3 ? `${lines.slice(0, 3).join("\n")}\n…` : text;
}

/**
 * Find the first difference of two nodes.
 *
 * @param {Node|null} a - Reference node
 * @param {Node|null} b - Tradik node
 * @param {string} path - Path of the nodes
 * @returns {{path: string, a: Node|null, b: Node|null}|null} The first
 *   difference, null when equal
 */
export function firstDifference(a, b, path) {
  if (!a || !b || nodeName(a) !== nodeName(b)) return { path, a, b };
  if (a.nodeType !== 1) {
    return a.nodeValue.trimEnd() === b.nodeValue.trimEnd()
      ? null
      : { path, a, b };
  }
  const attributes = (node) =>
    [...node.attributes]
      .map(
        (attr) => `${attr.namespaceURI ?? ""}|${attr.localName}=${attr.value}`,
      )
      .sort((x, y) => Number(x > y) - Number(x < y))
      .join("\n");
  if (attributes(a) !== attributes(b)) return { path, a, b };
  const left = significantChildren(a);
  const right = significantChildren(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const node = left[index] ?? right[index];
    const step = stepOf(node, left[index] ? left : right);
    const found = firstDifference(
      left[index] ?? null,
      right[index] ?? null,
      `${path}/${step}`,
    );
    if (found) return found;
  }
  return null;
}

/**
 * Compare two results line by line (text output, or markup that does not
 * parse).
 *
 * @param {string} expected - Normalized reference result
 * @param {string} actual - Normalized Tradik result
 * @returns {Comparison} The outcome
 */
function compareLines(expected, actual) {
  const left = expected.split("\n").map((line) => line.trimEnd());
  const right = actual.split("\n").map((line) => line.trimEnd());
  const index = left.findIndex((line, i) => line !== right[i]);
  const at = index < 0 ? left.length : index;
  if (index < 0 && left.length === right.length) return { status: "MATCH" };
  const lines = (list) =>
    snippet(list.slice(at, at + 3).join("\n")) || "(nothing)";
  return {
    status: "DIFFERENT",
    path: `line ${at + 1}`,
    expected: lines(left),
    actual: lines(right),
  };
}

/**
 * Compare a reference result with Tradik's.
 *
 * @param {string} expected - Reference result
 * @param {string} actual - Tradik result
 * @param {"xml"|"html"|"text"} method - Output method
 * @param {DomTools} tools - Parser and serializer
 * @returns {Comparison} The outcome
 */
export function compareOutputs(expected, actual, method, tools) {
  const left = normalizeOutput(expected);
  const right = normalizeOutput(actual);
  if (left === right) return { status: "MATCH" };
  if (method === "text") return compareLines(left, right);
  const a = tools.parse(left, method);
  const b = tools.parse(right, method);
  if (!a || !b) return compareLines(left, right);
  const root = a.documentElement;
  const rootPath = root.localName === WRAPPER ? "" : `/${root.localName}`;
  const found = firstDifference(root, b.documentElement, rootPath);
  if (!found) return { status: "MATCH" };
  return {
    status: "DIFFERENT",
    path: found.path || "/",
    expected: snippet(describeNode(found.a, tools.serialize)),
    actual: snippet(describeNode(found.b, tools.serialize)),
  };
}
