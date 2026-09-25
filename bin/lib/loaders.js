/**
 * XSLT Processor CLI - Stylesheet and Document Loaders
 *
 * Resolves the URIs of `xsl:include`, `xsl:import` and `document()` against
 * the stylesheet location and reads the referenced local files. Every URI is
 * turned into a file system path and passed through resolveInputPath, which
 * canonicalizes it with realpathSync and confines it to the base directory
 * BEFORE the file is read. Only relative references, absolute paths and
 * `file:` URLs are supported; network schemes are refused.
 */

"use strict";

import { readFileSync } from "node:fs";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { decodeXml } from "./decode.js";
import { resolveInputPath } from "./paths.js";

/**
 * Error raised for a URI the CLI refuses to load.
 */
export class CliUriError extends Error {
  /**
   * @param {string} message - Human readable explanation
   */
  constructor(message) {
    super(message);
    this.name = "CliUriError";
  }
}

/**
 * Convert an absolute file path into the base URI handed to the engine.
 *
 * @param {string} path - Absolute file path
 * @returns {string} The `file:` URL of the path
 *
 * @example
 * toBaseUri('/work/main.xsl'); // 'file:///work/main.xsl'
 */
export function toBaseUri(path) {
  return pathToFileURL(path).href;
}

/**
 * Turn a (possibly relative) URI into a local file path.
 *
 * @param {string} uri - URI as resolved by the engine
 * @param {string} [baseUri] - Base URI of the referencing stylesheet
 * @param {string} baseDir - Canonical base directory, used when no base URI is known
 * @returns {string} Absolute file system path, not yet validated
 * @throws {CliUriError} When the URI is malformed or uses a non-file scheme
 */
export function uriToPath(uri, baseUri, baseDir) {
  let url;

  try {
    url = new URL(uri, baseUri || toBaseUri(`${baseDir}/`));
  } catch {
    throw new CliUriError(`Invalid URI: ${uri}`);
  }

  if (url.protocol !== "file:") {
    throw new CliUriError(
      `Only local files can be loaded, refusing ${url.protocol} URI: ${uri}`,
    );
  }

  return fileURLToPath(url);
}

/**
 * Validate and read a referenced XML file.
 *
 * @param {string} uri - URI as resolved by the engine
 * @param {string} [baseUri] - Base URI of the referencing stylesheet
 * @param {string} baseDir - Canonical base directory
 * @param {string} label - Human readable role of the file, used in errors
 * @returns {string} The decoded file content
 * @throws {Error} When the URI is refused or the file is missing, outside baseDir or undecodable
 */
function readReferencedFile(uri, baseUri, baseDir, label) {
  const path = resolveInputPath(
    uriToPath(uri, baseUri, baseDir),
    label,
    baseDir,
  );
  return decodeXml(readFileSync(path), path);
}

/**
 * Create the loader used for `xsl:include` and `xsl:import`.
 *
 * @param {string} baseDir - Canonical base directory
 * @returns {(href: string, baseUri?: string) => string} Stylesheet loader
 *
 * @example
 * processor.setStylesheetLoader(createStylesheetLoader(baseDir));
 */
export function createStylesheetLoader(baseDir) {
  return (href, baseUri) =>
    readReferencedFile(href, baseUri, baseDir, "Stylesheet");
}

/**
 * Create the loader used for the XSLT `document()` function.
 *
 * A document that cannot be loaded yields an empty node-set (XSLT 1.0
 * section 12.1 allows recovering this way) and a one line warning.
 *
 * @param {string} baseDir - Canonical base directory
 * @param {(message: string) => void} [warn] - Warning sink, stderr by default
 * @returns {(uri: string, baseUri?: string) => (string|null)} Document loader
 *
 * @example
 * processor.setDocumentLoader(createDocumentLoader(baseDir));
 */
export function createDocumentLoader(baseDir, warn = console.error) {
  return (uri, baseUri) => {
    try {
      return readReferencedFile(uri, baseUri, baseDir, "Document");
    } catch (error) {
      warn(`Warning: document('${uri}') is empty: ${error.message}`);
      return null;
    }
  };
}
