/**
 * XSLTProcessor: the W3C/browser-style API over compileStylesheet, with
 * the method names of the @tradik/xslt-processor (XSLT 1.0) package.
 *
 * @module @tradik/xslt3/xslt/processor
 */

import { serialize } from "../serialize/index.js";
import { compileStylesheet } from "./api.js";

/**
 * @param {string|null} namespaceURI
 * @param {string} localName
 * @returns {string} Clark name
 */
const keyOf = (namespaceURI, localName) =>
  `{${namespaceURI ?? ""}}${localName}`;

/**
 * A loader of the 1.0 package's API, which may return XML text, as a
 * loader of documents.
 * @param {Function} loader - `(uri, base) => Document|string|null`
 * @param {(text: string, uri?: string) => Document} [parseXml]
 * @returns {(uri: string, base?: string) => Document|null}
 */
function documentsFrom(loader, parseXml) {
  return (uri, base) => {
    const result = loader(uri, base);
    if (typeof result !== "string") return result;
    if (parseXml) return parseXml(result, uri);
    return new globalThis.DOMParser().parseFromString(
      result,
      "application/xml",
    );
  };
}

/**
 * Checks a loader given to a setter.
 * @param {*} loader
 * @param {string} method - Name of the setter, for the message
 * @throws {TypeError} when it is neither a function nor null
 */
function checkLoader(loader, method) {
  if (loader != null && typeof loader !== "function") {
    throw new TypeError(`${method}: the loader must be a function or null`);
  }
}

/** Applies an XSLT 3.0/2.0 stylesheet to documents. */
export class XSLTProcessor {
  /**
   * @param {object} [options] - Options of compileStylesheet and
   *   CompiledStylesheet.transform used for every transformation
   */
  constructor(options = {}) {
    this.options = options;
    this.stylesheet = null;
    /** @type {Map<string, *>} */
    this.parameters = new Map();
  }

  /**
   * Compiles a stylesheet.
   * @param {Document|Element|string} style
   */
  importStylesheet(style) {
    this.stylesheet = compileStylesheet(style, this.options);
  }

  /**
   * Runs the imported stylesheet.
   * @param {Node} source
   * @returns {object} the transformation result
   */
  run(source) {
    if (!this.stylesheet) throw new Error("No stylesheet imported");
    return this.stylesheet.transform({
      ...this.options,
      source,
      params: this.parameters,
    });
  }

  /**
   * @param {Node} source
   * @returns {Document|DocumentFragment} the principal result
   */
  transformToDocument(source) {
    return this.run(source).principal;
  }

  /**
   * @param {Node} source
   * @returns {string} the principal result serialized with its output
   *   parameters (xsl:output, or the xsl:result-document that wrote it)
   */
  transformToString(source) {
    const { principal, output } = this.run(source);
    return serialize([principal].flat(), output);
  }

  /**
   * Sets the loader of included and imported modules, used by the next
   * importStylesheet().
   * @param {((uri: string, base?: string) => Document|string)|null} loader
   * @returns {XSLTProcessor} this
   */
  setStylesheetLoader(loader) {
    checkLoader(loader, "setStylesheetLoader");
    this.options = { ...this.options, loadStylesheet: loader ?? undefined };
    return this;
  }

  /**
   * Sets the loader of doc() and document(); it may return XML text.
   * @param {((uri: string, base?: string) => Document|string|null)|null} loader
   * @returns {XSLTProcessor} this
   */
  setDocumentLoader(loader) {
    checkLoader(loader, "setDocumentLoader");
    const documentLoader =
      loader == null ? undefined : documentsFrom(loader, this.options.parseXml);
    this.options = { ...this.options, documentLoader };
    return this;
  }

  /**
   * @param {Node} source
   * @param {Document} output - Document that owns the fragment
   * @returns {DocumentFragment} the principal result as a fragment
   */
  transformToFragment(source, output) {
    const { principal } = this.run(source);
    const fragment = output.createDocumentFragment();
    for (const child of principal.childNodes) {
      fragment.appendChild(output.importNode(child, true));
    }
    return fragment;
  }

  /**
   * @param {string|null} namespaceURI
   * @param {string} localName
   * @param {*} value
   */
  setParameter(namespaceURI, localName, value) {
    this.parameters.set(keyOf(namespaceURI, localName), value);
  }

  /**
   * @param {string|null} namespaceURI
   * @param {string} localName
   * @returns {*} the value, "" when not set (as in browsers)
   */
  getParameter(namespaceURI, localName) {
    return this.parameters.get(keyOf(namespaceURI, localName)) ?? "";
  }

  /**
   * @param {string|null} namespaceURI
   * @param {string} localName
   */
  removeParameter(namespaceURI, localName) {
    this.parameters.delete(keyOf(namespaceURI, localName));
  }

  /** Removes every parameter. */
  clearParameters() {
    this.parameters.clear();
  }

  /** Removes the stylesheet and the parameters. */
  reset() {
    this.stylesheet = null;
    this.parameters.clear();
  }
}
