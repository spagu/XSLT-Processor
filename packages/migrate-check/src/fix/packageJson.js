/**
 * Fix for package.json: adds the runtime packages to `dependencies` as a
 * text edit, so key order, indentation and line ends stay as they are.
 *
 * @module xslt-migrate-check/fix/packageJson
 */

import { DEPENDENCY_FIELDS, parseManifest } from "../manifest.js";
import { bomLength, eolOf, insertAt } from "./text.js";

/** The ranges the fix adds. */
export const RUNTIME_RANGES = Object.freeze({
  // 1.3.3 is the first release with the "/polyfill" entry the patch imports
  "@tradik/xslt-processor": "^1.3.3",
  "@tradik/xslt3": "^1.0.0",
});

/** The escape character of JSON strings. */
const BACKSLASH = "\u005C";

/**
 * Find the end of a JSON string.
 *
 * @param {string} text - JSON text
 * @param {number} offset - Offset of the opening quote
 * @returns {number} Offset after the closing quote
 */
function stringEnd(text, offset) {
  let index = offset + 1;
  while (index < text.length && text[index] !== '"') {
    index += text[index] === BACKSLASH ? 2 : 1;
  }
  return index + 1;
}

/**
 * Locate the root object's closing brace and the `dependencies` object.
 *
 * @param {string} text - JSON text of an object
 * @returns {{rootEnd: number, depsStart: number, depsEnd: number}} Offsets
 *   of the root `}`, and of the `{` and `}` of dependencies (-1 without)
 */
export function locate(text) {
  const found = { rootEnd: -1, depsStart: -1, depsEnd: -1 };
  let depth = 0;
  let lastKey = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      const end = stringEnd(text, index);
      if (depth === 1) lastKey = text.slice(index + 1, end - 1);
      index = end - 1;
    } else if (char === "{" || char === "[") {
      depth += 1;
      if (depth === 2 && lastKey === "dependencies") found.depsStart = index;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 1 && found.depsStart >= 0 && found.depsEnd < 0) {
        found.depsEnd = index;
      }
      if (depth === 0) found.rootEnd = index;
    } else if (char === "," && depth === 1) {
      lastKey = null;
    }
  }
  return found;
}

/**
 * The offset just after the last non-blank character before an offset.
 *
 * @param {string} text - The text
 * @param {number} offset - The offset
 * @returns {number} Offset after the previous token
 */
function afterPrevious(text, offset) {
  return text.slice(0, offset).trimEnd().length;
}

/**
 * The packages of a list that a package.json does not declare yet, in any
 * dependency field.
 *
 * @param {string} text - package.json text
 * @param {string[]} names - Package names
 * @returns {string[]} The missing ones
 */
export function missingDependencies(text, names) {
  const manifest = parseManifest(text.slice(bomLength(text)));
  const declared = new Set(
    DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] || {})),
  );
  return names.filter((name) => !declared.has(name));
}

/**
 * Add dependencies to a package.json.
 *
 * @param {string} text - package.json text (latin1)
 * @param {string[]} names - Packages to add (keys of RUNTIME_RANGES)
 * @returns {string|null} The new text, or null when every package is
 *   declared already or the file is not a JSON object
 */
export function addDependencies(text, names) {
  const missing = missingDependencies(text, names);
  const { rootEnd, depsStart, depsEnd } = locate(text);
  const isObject = text.slice(bomLength(text)).trimStart().startsWith("{");
  if (missing.length === 0 || rootEnd < 0 || !isObject) return null;
  const eol = eolOf(text);
  const unit = /^([ \t]+)"/m.exec(text)?.[1] ?? "  ";
  const entries = missing
    .map((name) => `${unit}${unit}"${name}": "${RUNTIME_RANGES[name]}"`)
    .join(`,${eol}`);
  if (depsStart >= 0) {
    const empty = text.slice(depsStart + 1, depsEnd).trim() === "";
    if (empty) {
      const block = `{${eol}${entries}${eol}${unit}}`;
      return text.slice(0, depsStart) + block + text.slice(depsEnd + 1);
    }
    return insertAt(text, afterPrevious(text, depsEnd), `,${eol}${entries}`);
  }
  const at = afterPrevious(text, rootEnd);
  const block = `"dependencies": {${eol}${entries}${eol}${unit}}`;
  if (text[at - 1] === "{") {
    return insertAt(text, at, eol + unit + block + eol);
  }
  return insertAt(text, at, `,${eol}${unit}${block}`);
}
