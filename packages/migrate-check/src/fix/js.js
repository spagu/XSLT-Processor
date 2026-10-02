/**
 * Fix for scripts: adds the polyfill import (ES modules) or require
 * (CommonJS) as the first statement, after a shebang, "use strict" and the
 * leading comment block.
 *
 * @module xslt-migrate-check/fix/js
 */

import { extensionOf } from "../detectors.js";
import { bomLength, eolOf, insertAt, splitLines } from "./text.js";

/** The line added to an ES module. */
export const POLYFILL_IMPORT_LINE = 'import "@tradik/xslt-processor/polyfill";';

/** The line added to a CommonJS file. */
export const POLYFILL_REQUIRE_LINE =
  'require("@tradik/xslt-processor/polyfill");';

const MODULE_EXTENSIONS = new Set([".mjs", ".mts", ".ts", ".tsx", ".jsx"]);
const COMMONJS_EXTENSIONS = new Set([".cjs", ".cts"]);
const ESM_SYNTAX = /^[ \t]*(?:import|export)[\s{*"']/m;
const REQUIRE_CALL = /\brequire\s*\(/;
const USE_STRICT = /^(["'])use strict\1;?$/;

/**
 * Decide how a script loads modules.
 *
 * @param {string} path - Report path
 * @param {string} text - File text
 * @param {string|undefined} packageType - The "type" of package.json
 * @returns {"module"|"commonjs"|null} The style, or null for a classic
 *   browser script (or a template) that cannot import
 */
export function moduleStyle(path, text, packageType) {
  const extension = extensionOf(path);
  if (MODULE_EXTENSIONS.has(extension)) return "module";
  if (COMMONJS_EXTENSIONS.has(extension)) return "commonjs";
  if (extension !== ".js") return null;
  if (ESM_SYNTAX.test(text)) return "module";
  if (REQUIRE_CALL.test(text)) return "commonjs";
  return packageType === "module" ? "module" : null;
}

/**
 * Tell whether a line belongs to the prologue the import goes after:
 * blank, a comment, or the "use strict" directive.
 *
 * @param {string} trimmed - The trimmed line
 * @param {{comment: boolean}} state - Inside a block comment
 * @returns {boolean} True to keep skipping
 */
function isPrologue(trimmed, state) {
  if (state.comment) {
    state.comment = !trimmed.includes("*/");
    return true;
  }
  if (trimmed === "" || trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("/*")) {
    state.comment = !trimmed.includes("*/", 2);
    return true;
  }
  return USE_STRICT.test(trimmed);
}

/**
 * The offset where the first statement starts.
 *
 * @param {string} text - File text
 * @returns {number} Offset of the line to insert before
 */
export function prologueEnd(text) {
  let offset = bomLength(text);
  const lines = splitLines(text.slice(offset));
  if (lines[0]?.startsWith("#!")) offset += lines.shift().length;
  const state = { comment: false };
  for (const line of lines) {
    if (!isPrologue(line.trim(), state)) break;
    offset += line.length;
  }
  return offset;
}

/**
 * Add the polyfill line to a script.
 *
 * @param {string} text - File text (latin1)
 * @param {"module"|"commonjs"} style - From moduleStyle
 * @returns {string} The new text
 */
export function addPolyfill(text, style) {
  const line =
    style === "module" ? POLYFILL_IMPORT_LINE : POLYFILL_REQUIRE_LINE;
  const eol = eolOf(text);
  const offset = prologueEnd(text);
  let insert = line + eol;
  if (offset === text.length && offset > 0 && !text.endsWith("\n")) {
    insert = eol + line + eol;
  }
  return insertAt(text, offset, insert);
}
