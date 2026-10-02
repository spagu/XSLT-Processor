/**
 * Text helpers of the automatic fixes. The fixes edit the original bytes:
 * files are read as latin1 (one character per byte), so UTF-8 sequences,
 * a byte order mark and CRLF line ends pass through unchanged, and only
 * ASCII is inserted.
 *
 * @module xslt-migrate-check/fix/text
 */

/** A UTF-8 byte order mark read as latin1, or as UTF-16 text. */
const BOMS = Object.freeze(["ï»¿", "﻿"]);

/**
 * The line end a text uses: CRLF when it has any, LF otherwise.
 *
 * @param {string} text - The text
 * @returns {"\r\n"|"\n"} The line end
 */
export function eolOf(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * The length of the byte order mark a text starts with (0 without one).
 *
 * @param {string} text - The text
 * @returns {number} Characters to skip
 */
export function bomLength(text) {
  return BOMS.find((bom) => text.startsWith(bom))?.length ?? 0;
}

/**
 * Split a text into lines that keep their line end, so joining them gives
 * the text back. The last line has no line end when the text has none.
 *
 * @param {string} text - The text
 * @returns {string[]} The lines (none for an empty text)
 */
export function splitLines(text) {
  const lines = [];
  let start = 0;
  while (start < text.length) {
    const end = text.indexOf("\n", start);
    if (end < 0) {
      lines.push(text.slice(start));
      break;
    }
    lines.push(text.slice(start, end + 1));
    start = end + 1;
  }
  return lines;
}

/**
 * The leading spaces and tabs of a line.
 *
 * @param {string} line - A line
 * @returns {string} Its indentation
 */
export function indentOf(line) {
  return /^[ \t]*/.exec(line)[0];
}

/**
 * The offset of the start of the line holding an offset.
 *
 * @param {string} text - The text
 * @param {number} offset - An offset into it
 * @returns {number} Offset of the line start
 */
export function lineStart(text, offset) {
  return text.lastIndexOf("\n", offset - 1) + 1;
}

/**
 * Insert a string at an offset.
 *
 * @param {string} text - The text
 * @param {number} offset - Where
 * @param {string} insert - What
 * @returns {string} The new text
 */
export function insertAt(text, offset, insert) {
  return text.slice(0, offset) + insert + text.slice(offset);
}
