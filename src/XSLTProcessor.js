/**
 * XSLTProcessor - JavaScript Implementation
 *
 * Native-compatible XSLTProcessor implementation for browser environments.
 * Based on W3C DOM Level 3 XSL Transformations and XSLT 1.0 Specification.
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
  constructor() {
    this._engine = null;
    this._stylesheet = null;
    this._parameters = new Map();
  }

  /**
   * Imports the XSLT stylesheet.
   *
   * If the given node is a document node, you can pass in a full XSL Transform
   * or a literal result element transform; otherwise, it must be an
   * <xsl:stylesheet> or <xsl:transform> element.
   *
   * @param {Node} style - The XSLT stylesheet to import (Document or Element)
   * @returns {void}
   *
   * @example
   * const parser = new DOMParser();
   * const xslDoc = parser.parseFromString(xslText, 'application/xml');
   * processor.importStylesheet(xslDoc);
   */
  importStylesheet(style) {
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
    const errorNode = style.querySelector
      ? style.querySelector("parsererror")
      : null;
    if (errorNode) {
      throw new Error("XSLT stylesheet contains parse errors");
    }

    this._stylesheet = style;
    this._engine = new XsltEngine();

    // Apply any previously set parameters
    for (const [key, value] of this._parameters) {
      this._engine.globalParameters[key] = { value };
    }

    this._engine.importStylesheet(style);
  }

  /**
   * Transforms the node source by applying the XSLT stylesheet.
   * Returns a document fragment.
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

    if (!this._engine || !this._stylesheet) {
      throw new Error(
        "Failed to execute 'transformToFragment' on 'XSLTProcessor': No stylesheet has been imported.",
      );
    }

    // Validate source node
    if (
      source.nodeType !== 1 &&
      source.nodeType !== 9 &&
      source.nodeType !== 11
    ) {
      throw new TypeError(
        "Failed to execute 'transformToFragment' on 'XSLTProcessor': The source is not a valid node type.",
      );
    }

    // Validate output document
    if (output.nodeType !== 9) {
      throw new TypeError(
        "Failed to execute 'transformToFragment' on 'XSLTProcessor': The output is not a Document.",
      );
    }

    try {
      return this._engine.transform(source, output);
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

    if (!this._engine || !this._stylesheet) {
      throw new Error(
        "Failed to execute 'transformToDocument' on 'XSLTProcessor': No stylesheet has been imported.",
      );
    }

    // Validate source node
    if (
      source.nodeType !== 1 &&
      source.nodeType !== 9 &&
      source.nodeType !== 11
    ) {
      throw new TypeError(
        "Failed to execute 'transformToDocument' on 'XSLTProcessor': The source is not a valid node type.",
      );
    }

    try {
      return this._engine.transformToDocument(source);
    } catch (error) {
      // Match native behavior - return null on error
      console.error("XSLT transformation error:", error);
      return null;
    }
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
      this._engine.globalParameters[key] = { value };
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
      delete this._engine.globalParameters[key];
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
      this._engine.globalParameters = {};
    }
  }

  /**
   * Removes all parameters and stylesheets from the XSLTProcessor.
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
    this._parameters.clear();
  }
}

/**
 * Check if native XSLTProcessor is available and functional
 *
 * @returns {boolean} True if native XSLTProcessor works correctly
 */
export function isNativeXSLTSupported() {
  if (typeof globalThis.XSLTProcessor === "undefined") {
    return false;
  }

  try {
    const processor = new globalThis.XSLTProcessor();
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

  globalThis.XSLTProcessor = XSLTProcessor;
  return true;
}

export default XSLTProcessor;
