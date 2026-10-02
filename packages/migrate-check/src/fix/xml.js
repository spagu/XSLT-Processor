/**
 * Fix for XML documents rendered with `<?xml-stylesheet?>`: adds the XHTML
 * loader script as the first child of the document element. The XML
 * declaration (and its encoding) and the prolog stay as they are.
 *
 * @module xslt-migrate-check/fix/xml
 */

import { SUGGESTION } from "../migration.js";
import { bomLength, eolOf, indentOf, insertAt } from "./text.js";

/** Prolog constructs and the text that closes each. */
const PROLOG_ENDS = Object.freeze([
  ["<?", "?>"],
  ["<!--", "-->"],
]);

/**
 * Skip a DOCTYPE declaration, internal subset included.
 *
 * @param {string} text - Document text
 * @param {number} offset - Offset of `<!DOCTYPE`
 * @returns {number} Offset after it, -1 when unterminated
 */
function skipDoctype(text, offset) {
  const subset = text.indexOf("[", offset);
  const close = text.indexOf(">", offset);
  if (subset >= 0 && subset < close) {
    const subsetEnd = text.indexOf("]", subset);
    return subsetEnd < 0 ? -1 : text.indexOf(">", subsetEnd) + 1 || -1;
  }
  return close < 0 ? -1 : close + 1;
}

/**
 * Find the start tag of the document element.
 *
 * @param {string} text - Document text
 * @returns {number} Offset of its `<`, -1 when there is none
 */
export function rootStart(text) {
  let offset = bomLength(text);
  while (offset >= 0 && offset < text.length) {
    const next = text.indexOf("<", offset);
    if (next < 0) return -1;
    const pair = PROLOG_ENDS.find(([open]) => text.startsWith(open, next));
    if (pair) {
      const close = text.indexOf(pair[1], next + pair[0].length);
      offset = close < 0 ? -1 : close + pair[1].length;
    } else if (text.startsWith("<!", next)) {
      offset = skipDoctype(text, next);
    } else {
      return next;
    }
  }
  return -1;
}

/**
 * Find the `>` that ends a start tag, skipping quoted attribute values.
 *
 * @param {string} text - Document text
 * @param {number} offset - Offset of the tag's `<`
 * @returns {number} Offset of its `>`, -1 when unterminated
 */
export function tagEnd(text, offset) {
  let quote = null;
  for (let index = offset + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

/**
 * Add the loader script to a rendered XML document.
 *
 * @param {string} text - Document text (latin1)
 * @returns {string|null} The new text, or null without a document element
 */
export function addLoader(text) {
  const tag = SUGGESTION.xmlScript;
  const eol = eolOf(text);
  const start = rootStart(text);
  const end = start < 0 ? -1 : tagEnd(text, start);
  if (end < 0) return null;
  if (text[end - 1] === "/") {
    const name = /^<([^\s/>]+)/.exec(text.slice(start))[1];
    const open = `${text.slice(start, end - 1).trimEnd()}>`;
    const element = `${open}${eol}  ${tag}${eol}</${name}>`;
    return text.slice(0, start) + element + text.slice(end + 1);
  }
  const rest = text.slice(end + 1);
  const newline = /^\r?\n/.exec(rest);
  if (!newline) return insertAt(text, end + 1, tag);
  const next = rest.slice(newline[0].length);
  const indent = next.startsWith("</") ? "  " : indentOf(next);
  return insertAt(text, end + 1, eol + indent + tag);
}
