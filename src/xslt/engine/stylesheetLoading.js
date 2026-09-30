/**
 * Stylesheet loading: the main stylesheet and the xsl:import and
 * xsl:include modules (the top-level elements are in topLevel.js).
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { resolveUri } from "../uri.js";
import { parseXml, resolveDomParser } from "../domParsing.js";

/**
 * Whether an element is an xsl:stylesheet or xsl:transform element.
 *
 * @param {object} engine - The engine
 * @param {Element} root - The document element of a stylesheet module
 * @returns {boolean} True for a stylesheet element
 */
function isStylesheetElement(engine, root) {
  return (
    engine.isXsltElement(root, "stylesheet") ||
    engine.isXsltElement(root, "transform")
  );
}

export const stylesheetLoadingMethods = {
  /**
   * Set the loader used by xsl:import and xsl:include.
   *
   * @param {((href: string, baseUri?: string) => (Document|string))|null} loader - The loader, or null to remove it
   * @returns {XsltEngine} This engine, to allow chaining
   *
   * @example
   * engine.setStylesheetLoader((href) => readFileSync(href, 'utf8'));
   */
  setStylesheetLoader(loader) {
    this.stylesheetLoader = loader ?? null;
    return this;
  },

  /**
   * Resolve a relative URI against a base URI
   *
   * @param {string} href - The URI to resolve
   * @param {string} [baseUri] - The base URI
   * @returns {string} The resolved URI
   */
  resolveUri(href, baseUri) {
    return resolveUri(href, baseUri);
  },

  /**
   * Load an external stylesheet document with the stylesheet loader.
   *
   * @param {string} href - The referenced URI
   * @param {string} [baseUri] - Base URI of the referencing stylesheet
   * @returns {{document: (Document|string), uri: string}} What the loader
   *   returned (a string is parsed by the caller) and the resolved URI
   * @throws {Error} When no stylesheet loader is configured
   */
  loadStylesheet(href, baseUri) {
    if (!this.stylesheetLoader) {
      throw new Error(
        `Cannot load stylesheet "${href}": no stylesheetLoader configured. ` +
          "Use engine.setStylesheetLoader(fn) to provide a loader function.",
      );
    }

    const resolvedUri = this.resolveUri(href, baseUri);
    const result = this.stylesheetLoader(resolvedUri, baseUri);
    return { document: result, uri: resolvedUri };
  },

  /**
   * Parse an XML string returned by a stylesheet or document loader, with
   * the `domParser` option, else the global DOMParser, else the DOMParser of
   * the stylesheet's window (see domParsing.js).
   *
   * @param {string} xmlString - The markup
   * @returns {Document} The parsed document
   * @throws {Error} When no parser is available or the markup is malformed
   */
  parseXmlString(xmlString) {
    return parseXml(
      xmlString,
      resolveDomParser(this.domParser, this.stylesheetDoc),
    );
  },

  /**
   * Import and compile an XSLT stylesheet
   * @param {Document|Element} stylesheetNode - The stylesheet document or root element
   * @param {string} [stylesheetUri] - Optional URI of the stylesheet for resolving imports
   */
  importStylesheet(stylesheetNode, stylesheetUri) {
    const isMainStylesheet = this.stylesheetDoc === null;

    if (isMainStylesheet) {
      this.stylesheetDoc = stylesheetNode.ownerDocument || stylesheetNode;
      if (stylesheetUri) this.baseUri = stylesheetUri;
      if (this.baseUri) this.stylesheetStack.push(this.baseUri);
    }

    const root = stylesheetNode.documentElement || stylesheetNode;

    if (!isStylesheetElement(this, root)) {
      // A literal result element as document element: simplified stylesheet
      if (root.getAttribute && root.getAttribute("xsl:version")) {
        this.processLiteralResultStylesheet(root);
        return;
      }
      throw new Error(
        "Invalid XSLT stylesheet: root element must be xsl:stylesheet or xsl:transform",
      );
    }

    this.processTopLevelElements(root, stylesheetUri || this.baseUri);

    // Increment import precedence after processing this stylesheet
    if (isMainStylesheet) {
      this.currentImportPrecedence++;
    }
  },

  /**
   * Process an xsl:include element: the included stylesheet is merged at the
   * import precedence of the including stylesheet.
   *
   * @param {Element} node - The xsl:include element
   * @param {string} baseUri - URI of the including stylesheet
   * @returns {void}
   */
  processInclude(node, baseUri) {
    const savedPrecedence = this.currentImportPrecedence;
    this.loadStylesheetModule(node, baseUri, "include");
    this.currentImportPrecedence = savedPrecedence;
  },

  /**
   * Process an xsl:import element: the imported stylesheet gets a lower import
   * precedence than everything processed after it.
   *
   * @param {Element} node - The xsl:import element
   * @param {string} baseUri - URI of the importing stylesheet
   * @returns {void}
   */
  processImport(node, baseUri) {
    this.loadStylesheetModule(node, baseUri, "import");
    this.currentImportPrecedence++;
  },

  /**
   * Load and process the stylesheet referenced by xsl:import or xsl:include.
   *
   * Only a stylesheet that (directly or indirectly) references itself is an
   * error; the same stylesheet may be reached through several branches of the
   * import tree ("diamond" imports), as in libxslt.
   *
   * @param {Element} node - The xsl:import or xsl:include element
   * @param {string} baseUri - URI of the referencing stylesheet
   * @param {"import"|"include"} kind - The referencing instruction
   * @returns {void}
   * @throws {Error} When href is missing, loading fails or a cycle is found
   */
  loadStylesheetModule(node, baseUri, kind) {
    const href = node.getAttribute("href");
    if (!href) {
      throw new Error(`xsl:${kind} requires an href attribute`);
    }

    const resolvedUri = this.resolveUri(href, baseUri);
    if (this.stylesheetStack.includes(resolvedUri)) {
      throw new Error(`Circular stylesheet reference detected: ${resolvedUri}`);
    }

    this.stylesheetStack.push(resolvedUri);
    try {
      const { document: loaded } = this.loadStylesheet(href, baseUri);
      const doc =
        typeof loaded === "string" ? this.parseXmlString(loaded) : loaded;
      this.processIncludedStylesheet(doc, resolvedUri);
    } catch (error) {
      throw new Error(
        `Failed to ${kind} stylesheet "${href}": ${error.message}`,
        { cause: error },
      );
    } finally {
      this.stylesheetStack.pop();
    }
  },

  /**
   * Process an included/imported stylesheet document.
   *
   * @param {Document|Element} stylesheetDoc - The loaded stylesheet module
   * @param {string} stylesheetUri - Its resolved URI
   * @returns {void}
   * @throws {Error} When the document is not an XSLT stylesheet
   */
  processIncludedStylesheet(stylesheetDoc, stylesheetUri) {
    const root = stylesheetDoc.documentElement || stylesheetDoc;
    if (!isStylesheetElement(this, root)) {
      throw new Error(
        "Included/imported document is not a valid XSLT stylesheet",
      );
    }
    this.processTopLevelElements(root, stylesheetUri);
  },
};
