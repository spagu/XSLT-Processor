/**
 * Per-file inspection: routes a file's text to the analyser for its
 * extension and records what it finds in a ScanResult. Pure (no Node.js
 * built-ins): the CLI and the browser both hand it texts.
 *
 * @module xslt-migrate-check/analysis/inspect
 */

/* global TextEncoder, TextDecoder */

import {
  HEAD_BYTES,
  SCRIPT_EXTENSIONS,
  STYLESHEET_EXTENSIONS,
  XML_EXTENSIONS,
  detectXmlStylesheetPi,
  extensionOf,
  isStylesheetHead,
} from "../detectors.js";
import { MIGRATED_PATTERN, detectUsages } from "./code.js";
import { detectStylesheet } from "./stylesheet.js";

/**
 * @typedef {object} ScanResult
 * @property {number} scannedFiles - Files read
 * @property {Array<{file: string, line: number, text: string, method: string}>}
 *   usages - Browser-side XSLTProcessor usages and HTML links to XSL
 * @property {Array<{file: string, line: number, text: string}>} domParser -
 *   DOMParser lines next to those usages (context only)
 * @property {Array<object>} stylesheets - XSL stylesheets with their facts
 * @property {Array<object>} xmlDocuments - XML files with an xml-stylesheet PI
 * @property {Array<{file: string, count: number}>} migrated - Files that
 *   already load @tradik/xslt-processor
 * @property {string[]} serverSide - Server-side XSLT packages in package.json,
 *   and "xsltproc" when an npm script runs it
 */

/**
 * A ScanResult with nothing in it.
 *
 * @returns {ScanResult} The empty result
 */
export function emptyScan() {
  return {
    scannedFiles: 0,
    usages: [],
    domParser: [],
    stylesheets: [],
    xmlDocuments: [],
    migrated: [],
    serverSide: [],
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The first HEAD_BYTES bytes of a text (UTF-8), as text: what decides
 * whether an XML file is a stylesheet or a rendered document.
 *
 * @param {string} text - The whole file
 * @returns {string} Its head
 */
export function headOf(text) {
  const start = text.slice(0, HEAD_BYTES);
  const bytes = encoder.encode(start);
  if (bytes.length <= HEAD_BYTES) return start;
  return decoder.decode(bytes.subarray(0, HEAD_BYTES));
}

/**
 * Record the XSLTProcessor usages of a script or template file.
 *
 * @param {string} file - Report path
 * @param {string} text - File text
 * @param {ScanResult} result - Accumulator
 * @returns {void}
 */
function inspectScript(file, text, result) {
  const { matches, migrated, domParser } = detectUsages(
    text,
    extensionOf(file),
  );
  if (matches.length === 0) return;
  if (migrated) {
    result.migrated.push({ file, count: matches.length });
    return;
  }
  result.usages.push(...matches.map((match) => ({ file, ...match })));
  result.domParser.push(...domParser.map((entry) => ({ file, ...entry })));
}

/**
 * Decide what an XML file is (stylesheet, rendered document, other) and
 * record it. A rendered document that already carries the loader script
 * counts as migrated.
 *
 * @param {string} file - Report path
 * @param {string} text - File text
 * @param {ScanResult} result - Accumulator
 * @returns {void}
 */
function inspectXml(file, text, result) {
  const head = headOf(text);
  if (isStylesheetHead(head)) {
    result.stylesheets.push({ file, ...detectStylesheet(text) });
    return;
  }
  const instruction = detectXmlStylesheetPi(head);
  if (!instruction) return;
  if (MIGRATED_PATTERN.test(text)) {
    result.migrated.push({ file, count: 1 });
  } else {
    result.xmlDocuments.push({ file, ...instruction });
  }
}

/**
 * Tell whether a file's text is needed by the analysis: scripts and
 * templates, stylesheets, XML documents and the root package.json.
 *
 * @param {string} path - Report path
 * @returns {boolean} True when inspectText reads it
 */
export function isAnalysed(path) {
  const extension = extensionOf(path);
  return (
    path === "package.json" ||
    SCRIPT_EXTENSIONS.has(extension) ||
    STYLESHEET_EXTENSIONS.has(extension) ||
    XML_EXTENSIONS.has(extension)
  );
}

/**
 * Route one file to the detector for its extension.
 *
 * @param {string} file - Report path (relative, `/` separators)
 * @param {string} text - File text
 * @param {ScanResult} result - Accumulator
 * @returns {void}
 */
export function inspectText(file, text, result) {
  const extension = extensionOf(file);
  if (SCRIPT_EXTENSIONS.has(extension)) {
    inspectScript(file, text, result);
  } else if (STYLESHEET_EXTENSIONS.has(extension)) {
    result.stylesheets.push({ file, ...detectStylesheet(text) });
  } else if (XML_EXTENSIONS.has(extension)) {
    inspectXml(file, text, result);
  }
}
