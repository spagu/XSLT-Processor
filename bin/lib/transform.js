/**
 * XSLT Processor CLI - Transformation Helpers
 *
 * DOM environment setup, document parsing and the transformation itself.
 * Output is serialized in chunks (src/async/stream.js, the same serializer
 * as XSLTProcessor#transformToString) so that the xsl:output settings of the
 * stylesheet are honored and large results are written as they are produced.
 */

"use strict";

import { XSLTProcessor } from "../../src/XSLTProcessor.js";
import { transformToChunks } from "../../src/async/stream.js";
import { findParseError } from "../../src/xslt/domParsing.js";
import {
  createDocumentLoader,
  createStylesheetLoader,
  toBaseUri,
} from "./loaders.js";
import { installDomGlobals, loadDomEnvironment } from "./dom.js";

/**
 * Create the DOM environment of the command line tool and expose it
 * globally (see dom.js): jsdom, else @xmldom/xmldom; `XSLT_DOM=xmldom` or
 * `XSLT_DOM=jsdom` picks one.
 *
 * The XSLT engine builds its result documents through the global `document`,
 * so the globals have to be installed before transforming.
 *
 * @param {string} [name] - DOM implementation, default `$XSLT_DOM`
 * @returns {Promise<import("./dom.js").DomEnvironment>} The environment
 * @throws {Error} When no DOM implementation is installed
 */
export async function createDomEnvironment(name = process.env.XSLT_DOM) {
  return installDomGlobals(await loadDomEnvironment(name));
}

/**
 * Parse an XML string, reporting parser errors as exceptions.
 *
 * @param {import("./dom.js").DomEnvironment} dom - DOM environment
 * @param {string} content - XML source text
 * @param {string} label - Human readable document label used in errors
 * @returns {Document} Parsed document
 */
export function parseDocument(dom, content, label) {
  const doc = new dom.window.DOMParser().parseFromString(
    content,
    "application/xml",
  );

  const error = findParseError(doc);
  if (error) {
    throw new Error(`Error parsing ${label}: ${error.textContent}`);
  }

  return doc;
}

/** Output methods accepted by `--method`. */
export const OUTPUT_METHODS = Object.freeze(["xml", "html", "xhtml", "text"]);

/**
 * Override the stylesheet xsl:output settings from the command line flags.
 *
 * @param {XSLTProcessor} processor - Processor with an imported stylesheet
 * @param {object} values - Parsed command line option values
 * @returns {object} The effective output settings
 * @throws {Error} When `--method` is not one of {@link OUTPUT_METHODS}
 */
export function applyOutputOverrides(processor, values) {
  const settings = processor.engine.outputSettings;

  if (values.format || values.indent) {
    settings.indent = "yes";
  }
  if (values.method) {
    if (!OUTPUT_METHODS.includes(values.method)) {
      throw new Error(
        `Invalid --method "${values.method}": expected xml, html, xhtml or text`,
      );
    }
    settings.method = values.method;
  }
  if (values["no-declaration"]) {
    settings.omitXmlDeclaration = "yes";
  }

  return settings;
}

/**
 * @typedef {Object} TransformationInputs
 * @property {import("./dom.js").DomEnvironment} dom - DOM environment
 * @property {string} xmlContent - XML source text
 * @property {string} xsltContent - XSLT stylesheet text
 * @property {Record<string, string>} params - Stylesheet parameters
 * @property {object} values - Parsed command line option values
 * @property {string} [xsltFile] - Canonical stylesheet path; enables
 *   xsl:include, xsl:import and document() relative to it
 * @property {string} [baseDir] - Canonical base directory every loaded file
 *   is confined to (required together with xsltFile)
 * @property {(message: string) => void} [warn] - Warning sink for document()
 */

/**
 * @typedef {Object} StreamedTransformation
 * @property {Iterator<string>} chunks - The serialized result in chunks of
 *   bounded size (see src/xslt/serializer/chunks.js), with character
 *   references for the characters the output encoding cannot represent
 * @property {string} encoding - The effective `xsl:output` encoding, the
 *   encoding the result has to be written in
 */

/**
 * Run a transformation; its result is serialized as the chunks are read,
 * so the output is written without ever being held as one string.
 *
 * @param {TransformationInputs} inputs - Transformation inputs
 * @returns {StreamedTransformation} The result chunks and their encoding
 * @throws {Error} "Transformation failed" when the transformation fails
 *   (the cause is reported on stderr, as XSLTProcessor does)
 */
export function streamTransformation({
  dom,
  xmlContent,
  xsltContent,
  params,
  values,
  xsltFile,
  baseDir,
  warn,
}) {
  const xmlDoc = parseDocument(dom, xmlContent, "XML");
  const xsltDoc = parseDocument(dom, xsltContent, "XSLT");

  const processor = new XSLTProcessor();
  if (xsltFile) {
    processor.setStylesheetLoader(createStylesheetLoader(baseDir));
    processor.setDocumentLoader(createDocumentLoader(baseDir, warn));
  }
  processor.importStylesheet(xsltDoc, xsltFile && toBaseUri(xsltFile));

  for (const [name, value] of Object.entries(params)) {
    processor.setParameter(null, name, value);
  }

  applyOutputOverrides(processor, values);

  let chunks;
  try {
    chunks = transformToChunks(processor.engine, xmlDoc);
  } catch (error) {
    console.error("XSLT transformation error:", error);
    throw new Error("Transformation failed", { cause: error });
  }
  return { chunks, encoding: processor.engine.outputSettings.encoding };
}

/**
 * Run a transformation and serialize its result to one string.
 *
 * @param {TransformationInputs} inputs - Transformation inputs
 * @returns {{output: string, encoding: string}} The serialized result and
 *   its encoding
 * @throws {Error} "Transformation failed" when the transformation fails
 */
export function runTransformation(inputs) {
  const { chunks, encoding } = streamTransformation(inputs);
  return { output: [...chunks].join(""), encoding };
}
