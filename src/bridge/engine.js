/**
 * Xslt3Engine: @tradik/xslt3 behind the interface of the XSLT 1.0 engine
 *
 * XSLTProcessor drives its engine through a small interface (loaders,
 * parameters, importStylesheet, transformToFragment/Document/String,
 * outputSettings). This class implements it with `compileStylesheet` and
 * `CompiledStylesheet#transform` of @tradik/xslt3, so the W3C API, the
 * asynchronous API and the command line tool run XSLT 2.0/3.0 stylesheets
 * unchanged when `xsltVersion` is "auto".
 *
 * @module bridge/engine
 */

import { parseXml, resolveDomParser } from "../xslt/domParsing.js";
import { transformationMethods } from "../xslt/engine/transformation.js";
import { loadedXslt3 } from "./loader.js";
import { camelCaseOutput, documentResult, fragmentResult } from "./results.js";
import { stylesheetVersion } from "./version.js";

/**
 * A parameter value for @tradik/xslt3: node lists become arrays (sequences
 * of nodes); other values are converted by @tradik/xslt3 (strings to
 * xs:string, numbers to xs:double, booleans, nodes, arrays, Dates, maps).
 *
 * @param {*} value - Value given to setParameter
 * @returns {*} The value to pass
 */
function parameterValue(value) {
  const isNodeList =
    typeof value?.length === "number" && typeof value.item === "function";
  return isNodeList ? Array.from(value) : value;
}

/** Runs XSLT 2.0/3.0 stylesheets with @tradik/xslt3. */
export class Xslt3Engine {
  /**
   * @param {object} xslt3 - The @tradik/xslt3 module
   * @param {object} [options] - Options of XSLTProcessor
   * @param {Function|null} [options.stylesheetLoader] - xsl:import/include loader
   * @param {Function|null} [options.documentLoader] - doc()/document() loader
   * @param {(() => Date)|null} [options.clock] - current-dateTime() clock
   */
  constructor(xslt3, options = {}) {
    this.xslt3 = xslt3;
    this.stylesheetLoader = options.stylesheetLoader ?? null;
    this.documentLoader = options.documentLoader ?? null;
    this.clock = options.clock ?? null;
    /** Deprecated: xml output as XHTML elements in an HTML owner (pre-1.3.1) */
    this.legacyXhtmlFragments = options.legacyXhtmlFragments === true;
    /** @type {Map<string, *>} Parameters by `{uri}local` or `local` */
    this.parameters = new Map();
    this.compiled = null;
    this.stylesheetDoc = null;
    /** Output settings (camelCase); changes override the stylesheet's. */
    this.outputSettings = {};
    this.declaredOutput = {};
  }

  /** @param {Function|null} loader - xsl:import/xsl:include loader */
  setStylesheetLoader(loader) {
    this.stylesheetLoader = loader;
  }

  /** @param {Function|null} loader - doc()/document() loader */
  setDocumentLoader(loader) {
    this.documentLoader = loader;
  }

  /**
   * @param {string} key - `{uri}local` or `local`
   * @param {*} value - The value
   */
  setParameterValue(key, value) {
    this.parameters.set(key, parameterValue(value));
  }

  /** @param {string} key - `{uri}local` or `local` */
  clearParameterValue(key) {
    this.parameters.delete(key);
  }

  /** Remove every parameter. */
  clearParameterValues() {
    this.parameters.clear();
  }

  /**
   * Parse markup returned by a loader.
   *
   * @param {string} text - XML markup
   * @returns {Document} The document
   */
  parseXmlString(text) {
    return parseXml(text, resolveDomParser(null, this.stylesheetDoc));
  }

  /**
   * A loader result as a document (markup is parsed).
   *
   * @param {Document|string|null} loaded - What a loader returned
   * @returns {Document|null} The document
   */
  toDocument(loaded) {
    return typeof loaded === "string" ? this.parseXmlString(loaded) : loaded;
  }

  /**
   * Compile a stylesheet.
   *
   * @param {Node} style - Stylesheet document or root element
   * @param {string} [stylesheetUri] - Its URI
   * @returns {void}
   * @throws {Error} The static errors of @tradik/xslt3 (XTSE...)
   */
  importStylesheet(style, stylesheetUri) {
    this.stylesheetDoc = style.ownerDocument ?? style;
    this.compiled = this.xslt3.compileStylesheet(style, {
      baseUri: stylesheetUri,
      // A module returned as markup is parsed with parseXml
      loadStylesheet: (uri) => this.stylesheetLoader?.(uri),
      parseXml: (text) => this.parseXmlString(text),
    });
    const declared = this.compiled.output;
    this.declaredOutput = camelCaseOutput({ encoding: "UTF-8", ...declared });
    this.outputSettings = { ...this.declaredOutput };
  }

  /**
   * Run the stylesheet on a source.
   *
   * @param {Node} source - Source document or element
   * @returns {{principal: Node, params: object}} The principal result and
   *   its serialization parameters
   */
  run(source) {
    const loader = this.documentLoader;
    const result = this.compiled.transform({
      source,
      params: this.parameters,
      documentLoader: loader && ((uri) => this.toDocument(loader(uri))),
      onMessage: (message) => console.log("XSLT Message:", message.textContent),
      currentDateTime: this.clock?.(),
    });
    return { principal: result.principal, params: this.paramsOf(result) };
  }

  /**
   * The serialization parameters of a result: those @tradik/xslt3 reports,
   * with the output settings changed through `outputSettings` on top.
   *
   * @param {{output: object}} result - A transformation result
   * @returns {Record<string, *>} camelCase parameters
   */
  paramsOf(result) {
    const params = camelCaseOutput(result.output);
    for (const [name, value] of Object.entries(this.outputSettings)) {
      if (value !== this.declaredOutput[name]) params[name] = value;
    }
    return params;
  }

  /**
   * @param {Node} source - Source document or element
   * @param {Document} output - Document that owns the fragment
   * @returns {DocumentFragment} The result fragment
   */
  transformToFragment(source, output) {
    const { principal, params } = this.run(source);
    return fragmentResult(principal, params, output, this.xslt3.serialize, {
      xhtmlElements: this.legacyXhtmlFragments,
    });
  }

  /**
   * @param {Node} source - Source document or element
   * @returns {Document} The result document
   */
  transformToDocument(source) {
    const { principal, params } = this.run(source);
    const doc = transformationMethods.createDocument(source);
    return documentResult(principal, params, doc, this.xslt3.serialize);
  }

  /**
   * @param {Node} source - Source document or element
   * @returns {string} The serialized result
   */
  transformToString(source) {
    const { principal, params } = this.run(source);
    return this.xslt3.serialize(principal, params);
  }

  /**
   * The serialized result in chunks (transformToStream, the CLI).
   *
   * @param {Node} source - Source document or element
   * @param {{chunkSize?: number}} [options] - Chunk size
   * @returns {Iterator<string>} The chunks
   */
  transformToChunks(source, options = {}) {
    const { principal, params } = this.run(source);
    return this.xslt3.serializeChunks(principal, params, options);
  }
}

/**
 * Create the engine of an XSLT 2.0/3.0 stylesheet, with the @tradik/xslt3
 * module loaded before (XSLTProcessor.preload or the asynchronous API).
 *
 * @param {Node} style - The stylesheet (for the error message)
 * @param {object} options - See {@link Xslt3Engine}
 * @returns {Xslt3Engine} The engine
 * @throws {Error} When @tradik/xslt3 has not been loaded
 */
export function createXslt3Engine(style, options) {
  const xslt3 = loadedXslt3();
  if (!xslt3) {
    throw new Error(
      `This XSLT ${stylesheetVersion(style).toFixed(1)} stylesheet needs @tradik/xslt3: ` +
        'call "await XSLTProcessor.preload()" before importStylesheet(), ' +
        "or use importStylesheetAsync() / transformAsync()",
    );
  }
  return new Xslt3Engine(xslt3, options);
}
