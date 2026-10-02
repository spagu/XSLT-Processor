/**
 * fn:xml-to-json (F&O 3.1 section 17.5.4): the XML representation of JSON
 * (elements map, array, string, number, boolean and null in the fn
 * namespace) to a JSON text. The input is checked against the rules of
 * the schema for that representation (FOJS0006); comments, processing
 * instructions and whitespace between elements are ignored.
 *
 * @module @tradik/xslt3/functions/json/xmlToJson
 */

import { formatDouble, parseDouble } from "../../xdm/numeric.js";
import { normalizeWhitespace, parseBoolean } from "../../xdm/strings.js";
import { readOptions } from "../options.js";
import { define, FN_NAMESPACE, stringItem } from "../support.js";
import { unescapeJsonChars } from "./jsonChars.js";
import { escapeChar, escapeJsonString, needsEscape } from "./jsonStrings.js";
import {
  checkAttributes,
  flag,
  invalid,
  members,
  textOf,
} from "./xmlRepresentation.js";

/**
 * A JSON string literal of a string or key.
 * @param {string} text
 * @param {boolean} escaped - The text holds JSON escape sequences, kept
 * @returns {string}
 */
function quote(text, escaped) {
  if (!escaped) return `"${escapeJsonString(text)}"`;
  let result = "";
  for (const { cp, escape } of unescapeJsonChars(text)) {
    result +=
      escape ?? (needsEscape(cp) ? escapeChar(cp) : String.fromCodePoint(cp));
  }
  return `"${result}"`;
}

/**
 * Writes one element of the representation.
 * @param {Element} element
 * @param {boolean} inMap - The element is an entry of a map (needs a key)
 * @param {string} indent - Line break and indentation, "" when not indenting
 * @returns {string}
 */
function write(element, inMap, indent) {
  if (element.namespaceURI !== FN_NAMESPACE) {
    invalid(`element {${element.namespaceURI ?? ""}}${element.localName}`);
  }
  const name = element.localName;
  checkAttributes(element);
  if (inMap && !element.hasAttribute("key")) invalid("an entry without key");
  flag(element, "escaped-key");
  const inner = indent && `${indent}  `;
  const list = (open, close, items) =>
    items.length
      ? `${open}${items.map((item) => inner + item).join(",")}${indent}${close}`
      : `${open}${close}`;
  switch (name) {
    case "map": {
      const keys = new Set();
      const entries = members(element).map((child) => {
        const escaped = flag(child, "escaped-key");
        const raw = child.getAttribute("key") ?? "";
        const key = escaped ? unescapeKey(raw) : raw;
        if (keys.has(key)) invalid(`duplicate key "${key}"`);
        keys.add(key);
        const separator = indent ? ": " : ":";
        return `${quote(raw, escaped)}${separator}${write(child, true, inner)}`;
      });
      return list("{", "}", entries);
    }
    case "array":
      return list(
        "[",
        "]",
        members(element).map((child) => write(child, false, inner)),
      );
    case "string":
      return quote(textOf(element), flag(element, "escaped"));
    case "number": {
      const value = parseDouble(
        normalizeWhitespace(textOf(element), "collapse"),
      );
      if (value === null || !Number.isFinite(value)) invalid("number");
      return formatDouble(value);
    }
    case "boolean": {
      const value = parseBoolean(
        normalizeWhitespace(textOf(element), "collapse"),
      );
      if (value === null) invalid("boolean");
      return String(value);
    }
    case "null":
      if (/\S/.test(textOf(element))) invalid("content in <null>");
      return "null";
    default:
      return invalid(`element <${name}>`);
  }
}

/**
 * The unescaped form of an escaped key, for duplicate detection.
 * @param {string} key
 * @returns {string}
 */
const unescapeKey = (key) =>
  unescapeJsonChars(key)
    .map(({ cp }) => String.fromCodePoint(cp))
    .join("");

/**
 * fn:xml-to-json of a node.
 * @param {Node} node - Document or element node
 * @param {Array} [optionsArg]
 * @returns {Array} an xs:string
 */
function xmlToJson(node, optionsArg) {
  const { indent } = readOptions(
    optionsArg?.[0],
    { indent: { type: "xs:boolean", default: false } },
    "FOJS0005",
  );
  let element = node;
  // 11: a temporary tree (xsl:variable without "as") is a document node
  if (node.nodeType === 9 || node.nodeType === 11) {
    const children = members(node);
    if (children.length !== 1) invalid("a document needs one element");
    element = children[0];
  } else if (node.nodeType !== 1) {
    invalid("not an element or document node");
  }
  return [stringItem(write(element, false, indent ? "\n" : ""))];
}

/** Function definitions. */
export const xmlToJsonFunctions = [
  define("xml-to-json", ["node()?"], "xs:string?", ([input]) =>
    input.length ? xmlToJson(input[0]) : [],
  ),
  define("xml-to-json", ["node()?", "map(*)"], "xs:string?", ([input, o]) =>
    input.length ? xmlToJson(input[0], o) : [],
  ),
];
