/**
 * Transformation pairs: the XML documents and the stylesheets to run them
 * with. Found from `<?xml-stylesheet?>` documents (whether migrated or not),
 * read from a pairs.json list, or given on the command line. Pure.
 *
 * @module xslt-migrate-check/compat/pairs
 */

import { resolveHref } from "../analysis/includes.js";
import { headOf } from "../analysis/inspect.js";
import {
  XML_EXTENSIONS,
  detectXmlStylesheetPi,
  extensionOf,
  isStylesheetHead,
} from "../detectors.js";

/**
 * @typedef {object} Pair
 * @property {string} xml - XML document, relative to the project
 * @property {string} xsl - Stylesheet, relative to the project
 * @property {Record<string, string>} params - Top-level parameters
 * @property {string|null} skip - Why it cannot run (null when it can)
 */

/**
 * Find the `<?xml-stylesheet?>` pairs of a project.
 *
 * @param {Array<{path: string, text?: string|null}>} files - The files
 * @returns {Pair[]} The pairs, in file order
 */
export function discoverPairs(files) {
  const paths = new Set(files.map((file) => file.path));
  const pairs = [];
  for (const { path, text } of files) {
    if (typeof text !== "string" || !XML_EXTENSIONS.has(extensionOf(path))) {
      continue;
    }
    const head = headOf(text);
    const instruction = isStylesheetHead(head)
      ? null
      : detectXmlStylesheetPi(head);
    if (!instruction) continue;
    const xsl = resolveHref(path, instruction.href);
    let skip = null;
    if (xsl === null) skip = "the stylesheet is a URL or missing";
    else if (!paths.has(xsl)) skip = "stylesheet not found in the project";
    pairs.push({ xml: path, xsl: xsl ?? instruction.href, params: {}, skip });
  }
  return pairs;
}

/**
 * Turn parameter values into strings, rejecting what is not a scalar.
 *
 * @param {unknown} params - The params of an entry
 * @param {number} index - The entry's position, for messages
 * @returns {Record<string, string>} The parameters
 * @throws {Error} When params is not an object of scalars
 */
function readParams(params, index) {
  if (params === undefined) return {};
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new Error(`entry ${index + 1}: "params" must be an object`);
  }
  const entries = Object.entries(params).map(([name, value]) => {
    if (value === null || typeof value === "object") {
      throw new Error(
        `entry ${index + 1}: parameter "${name}" must be a string or number`,
      );
    }
    return [name, String(value)];
  });
  return Object.fromEntries(entries);
}

/**
 * Read a pairs.json list: `[{ "xml": "...", "xsl": "...", "params": {} }]`.
 * Paths are kept as written; the caller resolves them.
 *
 * @param {string} text - The file's text
 * @returns {Pair[]} The pairs
 * @throws {Error} With a message naming the problem
 */
export function parsePairsJson(text) {
  let list;
  try {
    list = JSON.parse(text);
  } catch (error) {
    throw new Error(`not valid JSON (${error.message})`, { cause: error });
  }
  if (!Array.isArray(list)) throw new Error("expected an array of pairs");
  return list.map((entry, index) => {
    if (typeof entry?.xml !== "string" || typeof entry?.xsl !== "string") {
      throw new Error(`entry ${index + 1}: "xml" and "xsl" must be strings`);
    }
    return {
      xml: entry.xml,
      xsl: entry.xsl,
      params: readParams(entry.params, index),
      skip: null,
    };
  });
}

/**
 * Read `name=value` parameters of the command line.
 *
 * @param {string[]} values - The --param values
 * @returns {Record<string, string>} The parameters
 * @throws {Error} For a value without `=`
 */
export function parseParams(values) {
  const params = {};
  for (const value of values) {
    const equals = value.indexOf("=");
    if (equals <= 0) {
      throw new Error(`--param needs name=value, got "${value}"`);
    }
    params[value.slice(0, equals)] = value.slice(equals + 1);
  }
  return params;
}
