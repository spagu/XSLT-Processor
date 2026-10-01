/**
 * XSLTProcessor: the W3C/browser-style API over compileStylesheet, with
 * the method names of the @tradik/xslt-processor (XSLT 1.0) package.
 *
 * @module @tradik/xslt3/xslt/processor
 */

import { compileStylesheet } from "./api.js";

/**
 * @param {string|null} namespaceURI
 * @param {string} localName
 * @returns {string} Clark name
 */
const keyOf = (namespaceURI, localName) =>
  `{${namespaceURI ?? ""}}${localName}`;

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
   * @returns {*} the value, undefined when not set
   */
  getParameter(namespaceURI, localName) {
    return this.parameters.get(keyOf(namespaceURI, localName));
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
