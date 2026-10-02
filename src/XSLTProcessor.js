/**
 * XSLTProcessor - JavaScript Implementation
 *
 * Native-compatible XSLTProcessor implementation for browser environments.
 * Based on W3C DOM Level 3 XSL Transformations and XSLT 1.0 Specification.
 *
 * With the `xsltVersion: "auto"` option, XSLT 2.0/3.0 stylesheets are run by
 * the optional peer dependency @tradik/xslt3 (see bridge/).
 *
 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/XSLTProcessor
 * XSLT 1.0: http://www.w3.org/TR/1999/REC-xslt-19991116
 * XPath 1.0: http://www.w3.org/TR/1999/REC-xpath-19991116
 *
 * This implementation provides 1:1 API compatibility with the native
 * browser XSLTProcessor. It can be used as a replacement when native
 * XSLT support is deprecated or unavailable.
 */

import { XsltEngine } from "./xslt/engine.js";
import { findParseError } from "./xslt/domParsing.js";
import { preloadedDocumentLoader } from "./async/preload.js";
import {
  importStylesheetAsync,
  transformAsync,
  transformToStream,
} from "./async/processor.js";
import { createXslt3Engine } from "./bridge/engine.js";
import { loadXslt3 } from "./bridge/loader.js";
import { usesXslt3, xsltVersionMode } from "./bridge/version.js";

/**
 * The native XSLTProcessor constructor that installGlobal() replaced, kept so
 * that isNativeXSLTSupported() keeps probing the browser's implementation
 * rather than this one.
 */
let nativeProcessor = null;

/**
 * XSLTProcessor
 *
 * Applies XSLT stylesheet transformations to XML documents.
 *
 * @example
 * const processor = new XSLTProcessor();
 * processor.importStylesheet(xsltDoc);
 * const fragment = processor.transformToFragment(xmlDoc, document);
 */
export class XSLTProcessor {
  /**
   * @param {object} [options] - Non-standard options (the native constructor
   *   takes none)
   * @param {boolean} [options.legacyNameTests] - Deprecated: let unprefixed
   *   name tests (`item`, `@a`) also match nodes in a namespace, as before
   *   1.2.0. XPath 1.0 and Chrome only match nodes in no namespace.
   * @param {boolean} [options.enableDynamicEvaluate] - Allow EXSLT
   *   `dyn:evaluate()`, which evaluates XPath built from strings; enable it
   *   only for trusted input.
   * @param {() => Date} [options.clock] - Clock for EXSLT current-time
   *   functions (reproducible output).
   * @param {number} [options.maxTemplateDepth] - Deepest nesting of template
   *   instantiations; deeper recursion throws "Template recursion too deep"
   *   (default 3000, libxslt's limit).
   * @param {"1.0"|"auto"} [options.xsltVersion] - "1.0" (default): every
   *   stylesheet runs with the XSLT 1.0 engine, a `version="2.0"` one in
   *   forwards-compatible mode, as in Chrome. "auto": a stylesheet whose
   *   version is 2.0 or more runs with @tradik/xslt3 (an optional peer
   *   dependency, loaded on demand; see {@link XSLTProcessor.preload}).
   * @throws {RangeError} For an invalid `xsltVersion`
   *
   * @example
   * // Temporary migration aid for stylesheets written against 1.1.x
   * const processor = new XSLTProcessor({ legacyNameTests: true });
   *
   * @example
   * // XSLT 2.0/3.0 stylesheets through the same API
   * const processor = new XSLTProcessor({ xsltVersion: "auto" });
   * await processor.importStylesheetAsync(xsl20Doc);
   */
  constructor(options = {}) {
    this._options = {
      legacyNameTests: options?.legacyNameTests === true,
      enableDynamicEvaluate: options?.enableDynamicEvaluate === true,
      clock: options?.clock ?? null,
      maxTemplateDepth: options?.maxTemplateDepth,
      xsltVersion: xsltVersionMode(options?.xsltVersion),
    };
    this._engine = null;
    this._stylesheet = null;
    this._parameters = new Map();
    this._stylesheetLoader = null;
    this._documentLoader = null;
    // Set by importStylesheet/importStylesheetAsync: the URI and modules of
    // the stylesheet, and the document() documents preloaded asynchronously
    this._stylesheetUri = undefined;
    this._modules = [];
    this._preloadedDocuments = null;
  }

  /**
   * Load @tradik/xslt3, so that the synchronous API of processors created
   * with `xsltVersion: "auto"` can run XSLT 2.0/3.0 stylesheets (the
   * asynchronous API loads it by itself). Non-W3C.
   *
   * @param {"2.0"|"3.0"} [version] - The XSLT version to prepare for
   * @returns {Promise<void>} Resolves once the engine is loaded
   * @throws {RangeError} For another version (synchronously)
   * @throws {Error} Rejects with "Cannot load @tradik/xslt3: install
   *   @tradik/xslt3 to run XSLT 2.0/3.0 stylesheets" when it is missing
   *
   * @example
   * await XSLTProcessor.preload("3.0");
   * const processor = new XSLTProcessor({ xsltVersion: "auto" });
   * processor.importStylesheet(xsl30Doc);
   */
  static preload(version = "3.0") {
    if (version !== "2.0" && version !== "3.0") {
      throw new RangeError(
        `Invalid XSLT version "${version}": expected "2.0" or "3.0"`,
      );
    }
    return loadXslt3().then(() => undefined);
  }

  /**
   * The underlying XSLT engine (advanced usage).
   *
   * The engine is created lazily by {@link XSLTProcessor#importStylesheet},
   * so this getter returns `null` until a stylesheet has been imported.
   * Prefer the public {@link XSLTProcessor#setStylesheetLoader} over reaching
   * into the engine directly. A stylesheet run by @tradik/xslt3
   * (`xsltVersion: "auto"`) has an `Xslt3Engine` (bridge/engine.js).
   *
   * @returns {import('./xslt/engine.js').XsltEngine|import('./bridge/engine.js').Xslt3Engine|null}
   *   The engine, or null before import
   *
   * @example
   * processor.importStylesheet(xslDoc, '/styles/main.xsl');
   * console.log(processor.engine.outputSettings.method);
   */
  get engine() {
    return this._engine;
  }

  /**
   * Sets the loader used to resolve `xsl:import` and `xsl:include` references.
   *
   * The loader is synchronous: it MUST return the external stylesheet as a
   * `Document` or as an XML string (which is parsed automatically). Promises
   * are not awaited by the engine, so pre-load remote stylesheets before
   * calling `importStylesheet`.
   *
   * The loader may be set before or after `importStylesheet`. When set before,
   * it is passed to the engine on creation, which is required for the loader to
   * be used while the stylesheet is being compiled. When set after, the live
   * engine is updated as well.
   *
   * @param {((href: string, baseUri?: string) => (Document|string))|null} loader
   *   The loader function, or null to remove a previously configured loader
   * @returns {XSLTProcessor} This processor, to allow chaining
   * @throws {TypeError} If the loader is neither a function nor null
   *
   * @example
   * processor.setStylesheetLoader((href) => readFileSync(href, 'utf8'));
   * processor.importStylesheet(mainStylesheet, '/styles/main.xsl');
   */
  setStylesheetLoader(loader) {
    if (
      loader !== null &&
      loader !== undefined &&
      typeof loader !== "function"
    ) {
      throw new TypeError(
        "Failed to execute 'setStylesheetLoader' on 'XSLTProcessor': The loader argument must be a function or null.",
      );
    }

    this._stylesheetLoader = loader ?? null;

    // Keep an already created engine in sync
    if (this._engine) {
      this._engine.setStylesheetLoader(this._stylesheetLoader);
    }

    return this;
  }

  /**
   * Sets the loader used to resolve the XSLT `document()` function.
   *
   * The loader is synchronous: it MUST return the referenced document as a
   * `Document`, as an XML string (which is parsed automatically) or as `null`
   * when the document cannot be provided. Returning `null`, like configuring no
   * loader at all, makes `document()` evaluate to an empty node-set rather than
   * failing the transformation.
   *
   * The loader may be set before or after `importStylesheet`; a live engine is
   * kept in sync.
   *
   * @param {((uri: string, baseUri?: string) => (Document|string|null))|null} loader
   *   The loader function, or null to remove a previously configured loader
   * @returns {XSLTProcessor} This processor, to allow chaining
   * @throws {TypeError} If the loader is neither a function nor null
   *
   * @example
   * // Node.js: resolve document() against the file system
   * import { readFileSync } from 'node:fs';
   * processor.setDocumentLoader((uri) => readFileSync(uri, 'utf8'));
   * processor.importStylesheet(xslDoc, '/styles/main.xsl');
   */
  setDocumentLoader(loader) {
    if (
      loader !== null &&
      loader !== undefined &&
      typeof loader !== "function"
    ) {
      throw new TypeError(
        "Failed to execute 'setDocumentLoader' on 'XSLTProcessor': The loader argument must be a function or null.",
      );
    }

    this._documentLoader = loader ?? null;

    // Keep an already created engine in sync
    if (this._engine) {
      this._engine.setDocumentLoader(this._engineDocumentLoader());
    }

    return this;
  }

  /**
   * Imports the XSLT stylesheet.
   *
   * If the given node is a document node, you can pass in a full XSL Transform
   * or a literal result element transform; otherwise, it must be an
   * <xsl:stylesheet> or <xsl:transform> element.
   *
   * @param {Node} style - The XSLT stylesheet to import (Document or Element)
   * @param {string} [stylesheetUri] - Optional URI of the stylesheet, used as the
   *   base URI when resolving relative `xsl:import`/`xsl:include` hrefs. When
   *   omitted, hrefs are passed to the loader unresolved.
   * @returns {void}
   * @throws {Error} When the stylesheet is malformed or invalid, e.g. has an
   *   invalid pattern (XSLT 1.0 section 5.2), or, with `xsltVersion: "auto"`,
   *   is an XSLT 2.0/3.0 stylesheet and @tradik/xslt3 has not been loaded
   *   ({@link XSLTProcessor.preload})
   *
   * @example
   * const parser = new DOMParser();
   * const xslDoc = parser.parseFromString(xslText, 'application/xml');
   * processor.importStylesheet(xslDoc, '/styles/main.xsl');
   */
  importStylesheet(style, stylesheetUri) {
    if (!style) {
      throw new TypeError(
        "Failed to execute 'importStylesheet' on 'XSLTProcessor': 1 argument required, but only 0 present.",
      );
    }

    // Validate node type
    if (style.nodeType !== 1 && style.nodeType !== 9) {
      throw new TypeError(
        "Failed to execute 'importStylesheet' on 'XSLTProcessor': The node provided is not a Document or Element.",
      );
    }

    // Check for parser errors
    if (findParseError(style)) {
      throw new Error("XSLT stylesheet contains parse errors");
    }

    this._compile(style, stylesheetUri);
  }

  /**
   * Imports a stylesheet whose `xsl:import`/`xsl:include` modules and
   * literal `document('...')` documents are loaded asynchronously first
   * (non-W3C). The modules are loaded in parallel, each URI once; a cycle
   * rejects with "Circular stylesheet reference detected". A document that
   * fails to load is reported only if the transformation evaluates that
   * `document()` call. Computed `document()` URIs still go through the
   * synchronous {@link XSLTProcessor#setDocumentLoader} loader, and modules
   * that were not preloaded through {@link XSLTProcessor#setStylesheetLoader}.
   *
   * @param {Node|string|Uint8Array|ArrayBuffer|ReadableStream|AsyncIterable} style -
   *   The stylesheet: a node, or markup / a stream of markup to parse
   * @param {string} [stylesheetUri] - Base URI of relative hrefs and
   *   `document()` URIs
   * @param {object} [options] - Loading options
   * @param {Function} [options.loader] - `(uri, baseUri, { signal }) =>
   *   Promise<Document|string|Uint8Array|ArrayBuffer|Response|null>`; the
   *   global `fetch` by default
   * @param {Function} [options.documentLoader] - Loader of `document()`
   *   documents, `options.loader` by default
   * @param {AbortSignal} [options.signal] - Cancels loading
   * @returns {Promise<void>} Resolves once the stylesheet is imported; on
   *   failure the processor keeps its previous stylesheet
   *
   * @example
   * await processor.importStylesheetAsync(xslDoc, "https://example.com/xsl/main.xsl");
   */
  importStylesheetAsync(style, stylesheetUri, options = {}) {
    return importStylesheetAsync(this, style, stylesheetUri, options);
  }

  /**
   * Compile a stylesheet into a new engine; the processor is only updated
   * when compiling succeeds.
   *
   * @param {Node} style - The stylesheet
   * @param {string} [stylesheetUri] - Its URI
   * @param {object} [preloaded] - What importStylesheetAsync loaded
   * @param {Function|null} [preloaded.stylesheetLoader] - Module loader
   * @param {Node[]} [preloaded.modules] - Every stylesheet module
   * @param {Map<string, object>|null} [preloaded.documents] - document() documents
   * @returns {void}
   * @private
   */
  _compile(style, stylesheetUri, preloaded = {}) {
    const {
      stylesheetLoader = this._stylesheetLoader,
      modules = [style],
      documents = null,
    } = preloaded;
    const engineOptions = {
      legacyNameTests: this._options.legacyNameTests,
      enableDynamicEvaluate: this._options.enableDynamicEvaluate,
      clock: this._options.clock,
      maxTemplateDepth: this._options.maxTemplateDepth,
      stylesheetLoader,
      documentLoader: this._engineDocumentLoader(documents),
    };
    const engine = this._usesXslt3(style)
      ? createXslt3Engine(style, engineOptions)
      : new XsltEngine(engineOptions);

    // Apply any previously set parameters
    for (const [key, value] of this._parameters) {
      engine.setParameterValue(key, value);
    }

    // An invalid stylesheet (e.g. an invalid pattern) throws here and leaves
    // the processor as it was
    engine.importStylesheet(style, stylesheetUri);
    // Modules not preloaded keep going through the configured loader
    engine.setStylesheetLoader(this._stylesheetLoader);
    this._engine = engine;
    this._stylesheet = style;
    this._stylesheetUri = stylesheetUri;
    this._modules = modules;
    this._preloadedDocuments = documents;
  }

  /**
   * Whether a stylesheet is run by @tradik/xslt3 (`xsltVersion: "auto"` and
   * version 2.0 or more).
   *
   * @param {Node} style - The stylesheet
   * @returns {boolean} True for @tradik/xslt3
   * @private
   */
  _usesXslt3(style) {
    return usesXslt3(style, this._options.xsltVersion);
  }

  /**
   * Load the engine a stylesheet needs before compiling it (async API).
   *
   * @param {Node} style - The stylesheet
   * @returns {Promise<void>} Resolves once the engine is available
   * @private
   */
  async _prepareEngine(style) {
    if (this._usesXslt3(style)) await loadXslt3();
  }

  /**
   * The document() loader given to the engine: preloaded documents first,
   * then the configured synchronous loader.
   *
   * @param {Map<string, object>|null} [documents] - Preloaded documents
   * @returns {Function|null} The loader
   * @private
   */
  _engineDocumentLoader(documents = this._preloadedDocuments) {
    return documents
      ? preloadedDocumentLoader(documents, this._documentLoader)
      : this._documentLoader;
  }

  /**
   * Add asynchronously preloaded document() documents.
   *
   * @param {Map<string, object>} documents - Preloaded outcomes by URI
   * @returns {void}
   * @private
   */
  _usePreloadedDocuments(documents) {
    this._preloadedDocuments = new Map([
      ...(this._preloadedDocuments ?? []),
      ...documents,
    ]);
    this._engine.setDocumentLoader(this._engineDocumentLoader());
  }

  /**
   * Throw the native error of a transformation without stylesheet.
   *
   * @param {string} method - The method called
   * @returns {void}
   * @throws {Error} When no stylesheet has been imported
   * @private
   */
  _requireStylesheet(method) {
    if (!this._engine || !this._stylesheet) {
      throw new Error(
        `Failed to execute '${method}' on 'XSLTProcessor': No stylesheet has been imported.`,
      );
    }
  }

  /**
   * Throw the native error of a source that is not a document, element or
   * fragment.
   *
   * @param {string} method - The method called
   * @param {Node} source - The source node
   * @returns {void}
   * @throws {TypeError} For other node types
   * @private
   */
  _checkSource(method, source) {
    if (
      source.nodeType !== 1 &&
      source.nodeType !== 9 &&
      source.nodeType !== 11
    ) {
      throw new TypeError(
        `Failed to execute '${method}' on 'XSLTProcessor': The source is not a valid node type.`,
      );
    }
  }

  /**
   * Transforms the node source by applying the XSLT stylesheet.
   * Returns a document fragment.
   *
   * As in Chrome, when `output` is an HTML document and the output method is
   * `html` (declared, or detected from an `<html>` result root), the result
   * is serialized and parsed by the HTML parser of `output`, so it holds
   * real `HTMLElement`s (`<a>` is an `HTMLAnchorElement`, `<script>` runs
   * when inserted). Other results keep the element names and namespaces of
   * the result tree.
   *
   * @param {Node} source - The XML document to transform
   * @param {Document} output - The document that will own the generated fragment
   * @returns {DocumentFragment} The transformed result as a DocumentFragment
   *
   * @example
   * const fragment = processor.transformToFragment(xmlDoc, document);
   * document.getElementById('output').appendChild(fragment);
   */
  transformToFragment(source, output) {
    if (!source) {
      throw new TypeError(
        "Failed to execute 'transformToFragment' on 'XSLTProcessor': 2 arguments required, but only 0 present.",
      );
    }

    if (!output) {
      throw new TypeError(
        "Failed to execute 'transformToFragment' on 'XSLTProcessor': 2 arguments required, but only 1 present.",
      );
    }

    this._requireStylesheet("transformToFragment");

    this._checkSource("transformToFragment", source);

    // Validate output document
    if (output.nodeType !== 9) {
      throw new TypeError(
        "Failed to execute 'transformToFragment' on 'XSLTProcessor': The output is not a Document.",
      );
    }

    try {
      return this._engine.transformToFragment(source, output);
    } catch (error) {
      // Match native behavior - return null on error
      console.error("XSLT transformation error:", error);
      return null;
    }
  }

  /**
   * Transforms the node source by applying the XSLT stylesheet.
   * Returns a full XML document.
   *
   * @param {Node} source - The XML document to transform
   * @returns {XMLDocument} The transformed result as an XMLDocument
   *
   * @example
   * const resultDoc = processor.transformToDocument(xmlDoc);
   * const serialized = new XMLSerializer().serializeToString(resultDoc);
   */
  transformToDocument(source) {
    if (!source) {
      throw new TypeError(
        "Failed to execute 'transformToDocument' on 'XSLTProcessor': 1 argument required, but only 0 present.",
      );
    }

    this._requireStylesheet("transformToDocument");

    this._checkSource("transformToDocument", source);

    try {
      return this._engine.transformToDocument(source);
    } catch (error) {
      // Match native behavior - return null on error
      console.error("XSLT transformation error:", error);
      return null;
    }
  }

  /**
   * Transforms the node source by applying the XSLT stylesheet and serializes
   * the result to a string honoring the stylesheet `xsl:output` settings.
   *
   * Non-W3C convenience method: the native XSLTProcessor has no equivalent.
   * Output method, indentation, XML declaration, document type declaration,
   * CDATA sections and `disable-output-escaping` are all honored
   * (XSLT 1.0 section 16).
   *
   * @param {Node} source - The XML document to transform
   * @returns {string|null} The serialized result, or null on a transformation error
   *
   * @example
   * const xml = processor.transformToString(xmlDoc);
   * // '<?xml version="1.0" encoding="UTF-8"?>\n<BAR>\n  <QUX/>\n</BAR>'
   */
  transformToString(source) {
    if (!source) {
      throw new TypeError(
        "Failed to execute 'transformToString' on 'XSLTProcessor': 1 argument required, but only 0 present.",
      );
    }

    this._requireStylesheet("transformToString");

    this._checkSource("transformToString", source);

    try {
      return this._engine.transformToString(source);
    } catch (error) {
      // Match transformToDocument behavior - return null on error
      console.error("XSLT transformation error:", error);
      return null;
    }
  }

  /**
   * Transforms asynchronously and resolves with the serialized result
   * (non-W3C). The source may be a node, markup, bytes, a `ReadableStream`
   * or an async iterable of strings or bytes; streams are read to their end
   * before parsing, because XSLT 1.0 needs the whole source tree. Unlike
   * {@link XSLTProcessor#transformToString}, failures reject the promise.
   *
   * @param {Node|string|Uint8Array|ArrayBuffer|ReadableStream|AsyncIterable} source - Input
   * @param {object} [options] - Options
   * @param {AbortSignal} [options.signal] - Cancels loading and reading
   * @param {Node|string|ReadableStream|AsyncIterable} [options.stylesheet] -
   *   A stylesheet to import first with importStylesheetAsync
   * @param {string} [options.stylesheetUri] - The URI of that stylesheet
   * @param {Function} [options.fetchStylesheet] - Asynchronous loader of its
   *   xsl:import/xsl:include modules (`fetch` by default)
   * @param {Function} [options.fetchDocument] - Asynchronous loader of the
   *   literal document() documents (`fetchStylesheet` by default when a
   *   stylesheet is given)
   * @returns {Promise<string>} The serialized result
   *
   * @example
   * const html = await processor.transformAsync((await fetch("data.xml")).body);
   */
  transformAsync(source, options = {}) {
    return transformAsync(this, source, options);
  }

  /**
   * Transforms and returns the serialized result as a `ReadableStream` of
   * strings (non-W3C). The result tree is built in memory on the first read;
   * serialization then produces chunks of about `chunkSize` code units on
   * demand, so the output is never one string and the first bytes are
   * available before serialization ends. Failures error the stream.
   *
   * @param {Node|string|Uint8Array|ArrayBuffer|ReadableStream|AsyncIterable} source - Input
   * @param {{signal?: AbortSignal, chunkSize?: number}} [options] - `signal`
   *   cancels (errors the stream with its reason); `chunkSize` defaults to
   *   16384
   * @returns {ReadableStream<string>} The serialized result
   * @throws {Error} When no stylesheet has been imported
   * @throws {TypeError} For a source node of the wrong type
   * @throws {RangeError} For an invalid chunk size
   *
   * @example
   * // Node.js
   * Readable.fromWeb(processor.transformToStream(xmlDoc)).pipe(process.stdout);
   */
  transformToStream(source, options = {}) {
    return transformToStream(this, source, options);
  }

  /**
   * Sets a parameter in the XSLT stylesheet.
   *
   * @param {string|null} namespaceURI - The namespace URI of the XSLT parameter (use null for no namespace)
   * @param {string} localName - The local name of the parameter
   * @param {*} value - The value to set (string, number, boolean, or node-set)
   * @returns {void}
   *
   * @example
   * processor.setParameter(null, 'sortOrder', 'ascending');
   * processor.setParameter('http://example.com/ns', 'limit', 10);
   */
  setParameter(namespaceURI, localName, value) {
    if (arguments.length < 3) {
      throw new TypeError(
        `Failed to execute 'setParameter' on 'XSLTProcessor': 3 arguments required, but only ${arguments.length} present.`,
      );
    }

    if (typeof localName !== "string" || localName === "") {
      throw new TypeError(
        "Failed to execute 'setParameter' on 'XSLTProcessor': The localName argument must be a non-empty string.",
      );
    }

    const key = namespaceURI ? `{${namespaceURI}}${localName}` : localName;
    this._parameters.set(key, value);

    // If engine is already initialized, update it
    if (this._engine) {
      this._engine.setParameterValue(key, value);
    }
  }

  /**
   * Gets the value of a parameter from the XSLT stylesheet.
   *
   * @param {string|null} namespaceURI - The namespace URI of the parameter
   * @param {string} localName - The local name of the parameter
   * @returns {*} The parameter value, or empty string if not set
   *
   * @example
   * const sortOrder = processor.getParameter(null, 'sortOrder');
   */
  getParameter(namespaceURI, localName) {
    if (arguments.length < 2) {
      throw new TypeError(
        `Failed to execute 'getParameter' on 'XSLTProcessor': 2 arguments required, but only ${arguments.length} present.`,
      );
    }

    if (typeof localName !== "string") {
      throw new TypeError(
        "Failed to execute 'getParameter' on 'XSLTProcessor': The localName argument must be a string.",
      );
    }

    const key = namespaceURI ? `{${namespaceURI}}${localName}` : localName;

    if (this._parameters.has(key)) {
      return this._parameters.get(key);
    }

    // Return empty string for unset parameters (matches native behavior)
    return "";
  }

  /**
   * Removes a parameter from the XSLT processor.
   *
   * The XSLTProcessor will use the default value for the parameter
   * as specified in the XSLT stylesheet.
   *
   * @param {string|null} namespaceURI - The namespace URI of the parameter
   * @param {string} localName - The local name of the parameter
   * @returns {void}
   *
   * @example
   * processor.removeParameter(null, 'sortOrder');
   */
  removeParameter(namespaceURI, localName) {
    if (arguments.length < 2) {
      throw new TypeError(
        `Failed to execute 'removeParameter' on 'XSLTProcessor': 2 arguments required, but only ${arguments.length} present.`,
      );
    }

    if (typeof localName !== "string") {
      throw new TypeError(
        "Failed to execute 'removeParameter' on 'XSLTProcessor': The localName argument must be a string.",
      );
    }

    const key = namespaceURI ? `{${namespaceURI}}${localName}` : localName;
    this._parameters.delete(key);

    if (this._engine) {
      this._engine.clearParameterValue(key);
    }
  }

  /**
   * Removes all set parameters from the XSLTProcessor.
   *
   * The processor will use default values specified in the XSLT stylesheet.
   *
   * @returns {void}
   *
   * @example
   * processor.clearParameters();
   */
  clearParameters() {
    this._parameters.clear();

    if (this._engine) {
      this._engine.clearParameterValues();
    }
  }

  /**
   * Removes all parameters and stylesheets from the XSLTProcessor.
   *
   * Per the W3C `XSLTProcessor` semantics, `reset()` clears stylesheet state and
   * parameters only. The stylesheet and document loaders are processor
   * configuration rather than stylesheet state, so they are deliberately
   * preserved and stay effective for the next `importStylesheet()` call. Pass
   * `null` to {@link XSLTProcessor#setStylesheetLoader} or
   * {@link XSLTProcessor#setDocumentLoader} to remove them explicitly.
   *
   * @returns {void}
   *
   * @example
   * processor.reset();
   * // Now need to call importStylesheet() again before transforming
   */
  reset() {
    this._engine = null;
    this._stylesheet = null;
    this._stylesheetUri = undefined;
    this._modules = [];
    this._preloadedDocuments = null;
    this._parameters.clear();
  }
}

/**
 * Check if native XSLTProcessor is available and functional.
 *
 * After installGlobal() replaced the global, the original native constructor
 * is probed; this implementation never counts as native.
 *
 * @returns {boolean} True if native XSLTProcessor works correctly
 */
export function isNativeXSLTSupported() {
  const current = globalThis.XSLTProcessor;
  const Native = current === XSLTProcessor ? nativeProcessor : current;
  if (typeof Native !== "function") return false;

  try {
    const processor = new Native();
    const parser = new DOMParser();

    const xslt = parser.parseFromString(
      `<?xml version="1.0"?>
      <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        <xsl:template match="/"><test/></xsl:template>
      </xsl:stylesheet>`,
      "application/xml",
    );

    processor.importStylesheet(xslt);

    const xml = parser.parseFromString("<root/>", "application/xml");
    const result = processor.transformToFragment(xml, document);

    return result !== null && result.childNodes.length > 0;
  } catch {
    return false;
  }
}

/**
 * Install as global XSLTProcessor replacement if native is not functional
 *
 * @param {boolean} force - Force installation even if native is available
 * @returns {boolean} True if installed as global
 */
export function installGlobal(force = false) {
  if (!force && isNativeXSLTSupported()) {
    return false;
  }

  const current = globalThis.XSLTProcessor;
  if (typeof current === "function" && current !== XSLTProcessor) {
    nativeProcessor = current;
  }
  globalThis.XSLTProcessor = XSLTProcessor;
  return true;
}

export default XSLTProcessor;
