/**
 * Unified diffs, written without a dependency: one hunk per file around
 * the changed lines (the fixes insert at one or two nearby places), with
 * three lines of context, in the format `git apply` and `patch -p1` read.
 *
 * @module xslt-migrate-check/fix/patch
 */

import { splitLines } from "./text.js";

/** Lines of context around a change. */
export const CONTEXT = 3;

const NO_NEWLINE = String.raw`\ No newline at end of file`;

/**
 * Render one diff line: its prefix and text, with the "no newline" marker
 * when the line has no line end.
 *
 * @param {string} prefix - " ", "-" or "+"
 * @param {string} line - The line with its line end
 * @returns {string} The diff line(s)
 */
function diffLine(prefix, line) {
  return line.endsWith("\n")
    ? prefix + line
    : `${prefix}${line}\n${NO_NEWLINE}\n`;
}

/**
 * Count the lines two lists share at the start, and then at the end.
 *
 * @param {string[]} a - Old lines
 * @param {string[]} b - New lines
 * @returns {{head: number, tail: number}} Shared lines
 */
function sharedEnds(a, b) {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  const room = Math.min(a.length, b.length) - head;
  while (tail < room && a.at(-1 - tail) === b.at(-1 - tail)) tail += 1;
  return { head, tail };
}

/**
 * The `start,count` of a hunk range (start is the line before for an
 * empty range, as diff writes it).
 *
 * @param {number} start - 0-based first line
 * @param {number} count - Lines
 * @returns {string} The range
 */
function range(start, count) {
  return `${count === 0 ? start : start + 1},${count}`;
}

/**
 * The hunk of a change, without file headers.
 *
 * @param {string} before - Old text
 * @param {string} after - New text
 * @param {number} [context] - Lines of context
 * @returns {string} The hunk, "" when the texts are equal
 */
export function hunk(before, after, context = CONTEXT) {
  if (before === after) return "";
  const a = splitLines(before);
  const b = splitLines(after);
  const { head, tail } = sharedEnds(a, b);
  const from = Math.max(0, head - context);
  const oldEnd = Math.min(a.length, a.length - tail + context);
  const newEnd = oldEnd - a.length + b.length;
  const lines = [
    ...a.slice(from, head).map((line) => diffLine(" ", line)),
    ...a.slice(head, a.length - tail).map((line) => diffLine("-", line)),
    ...b.slice(head, b.length - tail).map((line) => diffLine("+", line)),
    ...a.slice(a.length - tail, oldEnd).map((line) => diffLine(" ", line)),
  ];
  const header = `@@ -${range(from, oldEnd - from)} +${range(from, newEnd - from)} @@\n`;
  return header + lines.join("");
}

/**
 * The unified diff of two texts with `---`/`+++` labels.
 *
 * @param {string} before - Old text
 * @param {string} after - New text
 * @param {{oldLabel: string, newLabel: string, context?: number}} labels -
 *   File labels and context lines
 * @returns {string} The diff, "" when the texts are equal
 */
export function unifiedDiff(before, after, { oldLabel, newLabel, context }) {
  const body = hunk(before, after, context);
  return body && `--- ${oldLabel}\n+++ ${newLabel}\n${body}`;
}

/**
 * The git-style diff of one file of the project.
 *
 * @param {string} path - Path relative to the project, `/` separators
 * @param {string} before - Old text
 * @param {string} after - New text
 * @returns {string} The file's diff, "" when unchanged
 */
export function fileDiff(path, before, after) {
  const body = unifiedDiff(before, after, {
    oldLabel: `a/${path}`,
    newLabel: `b/${path}`,
  });
  return body && `diff --git a/${path} b/${path}\n${body}`;
}

/**
 * A whole patch: `#` header lines (ignored by git apply), then the diff of
 * each edit in path order.
 *
 * @param {string[]} header - Header lines, without the `# `
 * @param {Array<{path: string, before: string, after: string}>} edits -
 *   The edits
 * @returns {string} The patch
 */
export function renderPatch(header, edits) {
  const sorted = [...edits].sort(
    (x, y) => (x.path > y.path) - (x.path < y.path),
  );
  const top = header.map((line) => `# ${line}`.trimEnd()).join("\n");
  const diffs = sorted.map((edit) =>
    fileDiff(edit.path, edit.before, edit.after),
  );
  return `${top}\n\n${diffs.join("")}`;
}
