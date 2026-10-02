/**
 * Fix for HTML pages with inline XSLTProcessor code: adds the CDN script
 * before the first script in `<head>`, or right after `<head>`.
 *
 * @module xslt-migrate-check/fix/html
 */

import { SUGGESTION } from "../migration.js";
import { eolOf, indentOf, insertAt, lineStart } from "./text.js";

const HEAD_START = /<head(?:\s[^>]*)?>/i;
const HEAD_END = /<\/head\s*>/i;
const SCRIPT_START = /<script\b/i;

/**
 * Insert the tag on its own line before an element that starts a line, or
 * just before it when other markup precedes it on that line.
 *
 * @param {string} text - Page text
 * @param {number} offset - Offset of the element
 * @param {string} tag - The script tag
 * @returns {string} The new text
 */
function insertBefore(text, offset, tag) {
  const start = lineStart(text, offset);
  const before = text.slice(start, offset);
  if (before.trim() !== "") return insertAt(text, offset, tag);
  return insertAt(text, start, before + tag + eolOf(text));
}

/**
 * The indentation of the children of `<head>`: that of the next line when
 * it is not `</head>`, else the head's own plus two spaces.
 *
 * @param {string} text - Page text
 * @param {number} headStart - Offset of `<head`
 * @param {number} headEnd - Offset just after `<head ...>`
 * @returns {string} The indentation
 */
function childIndent(text, headStart, headEnd) {
  const next = text.slice(headEnd).replace(/^\r?\n/, "");
  const nextLine = next.slice(0, next.indexOf("\n") + 1 || next.length);
  if (nextLine.trim() !== "" && !HEAD_END.test(nextLine)) {
    return indentOf(nextLine);
  }
  return `${indentOf(text.slice(lineStart(text, headStart)))}  `;
}

/**
 * Add the CDN script to a page.
 *
 * @param {string} text - Page text (latin1)
 * @returns {string|null} The new text, or null when the page has no `<head>`
 */
export function addCdnScript(text) {
  const tag = SUGGESTION.script;
  const head = HEAD_START.exec(text);
  if (!head) return null;
  const afterHead = head.index + head[0].length;
  const rest = text.slice(afterHead);
  const end = HEAD_END.exec(rest);
  const inHead = end ? rest.slice(0, end.index) : rest;
  const script = SCRIPT_START.exec(inHead);
  if (script) return insertBefore(text, afterHead + script.index, tag);
  if (!/^\r?\n/.test(rest)) return insertAt(text, afterHead, tag);
  const indent = childIndent(text, head.index, afterHead);
  return insertAt(text, afterHead, eolOf(text) + indent + tag);
}
