/**
 * Engine services behind the XSLT functions: document(), generate-id()
 * and key() (see functions.js).
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { resolveUri, stripFragment } from "../uri.js";

export const functionSupportMethods = {
  /**
   * Set the loader used by the XSLT `document()` function.
   *
   * The loader is synchronous and must return a `Document`, an XML string or
   * null. Returning null (or configuring no loader at all) makes `document()`
   * evaluate to an empty node-set instead of failing the transformation.
   *
   * @param {((uri: string, baseUri?: string) => (Document|string|null))|null} loader - The loader, or null to remove it
   * @returns {XsltEngine} This engine, to allow chaining
   *
   * @example
   * engine.setDocumentLoader((uri) => readFileSync(uri, 'utf8'));
   */
  setDocumentLoader(loader) {
    this.documentLoader = loader ?? null;
    this.loadedDocuments.clear();
    return this;
  },

  /**
   * Load an external document for the `document()` function.
   *
   * Results are cached per resolved URI for the life of the engine, so the same
   * URI always yields the identical node-set.
   *
   * @param {string} uri - The requested URI, fragment identifiers are ignored
   * @param {string} [baseUri] - Base URI used to resolve relative references
   * @returns {Document|null} The loaded document, or null when unavailable
   *
   * @example
   * engine.loadDocument('data.xml', '/styles/main.xsl');
   */
  loadDocument(uri, baseUri) {
    const target = stripFragment(uri);

    if (target === "") return this.stylesheetDoc;
    if (!this.documentLoader) return null;

    const resolved = resolveUri(target, baseUri);
    if (this.loadedDocuments.has(resolved)) {
      return this.loadedDocuments.get(resolved);
    }

    const loaded = this.documentLoader(resolved, baseUri);
    const doc =
      typeof loaded === "string" ? this.parseXmlString(loaded) : loaded || null;

    this.loadedDocuments.set(resolved, doc);
    return doc;
  },

  /**
   * Return the stable identifier of a node for `generate-id()`.
   *
   * @param {Node} node - The node to identify
   * @returns {string} An identifier starting with a letter
   *
   * @example
   * engine.generateId(element); // 'N1'
   */
  generateId(node) {
    let id = this.generatedIds.get(node);
    if (!id) {
      this.generatedIdCount++;
      id = `N${this.generatedIdCount}`;
      this.generatedIds.set(node, id);
    }
    return id;
  },

  /**
   * Evaluate the `use` expression of an `xsl:key` for one node.
   *
   * @param {Node} node - The node being indexed
   * @param {string} expression - The `use` expression
   * @param {Object<string, string>} [namespaces] - Prefixes in scope on the xsl:key
   * @returns {string[]} The key values contributed by the node
   */
  evaluateKeyValues(node, expression, namespaces) {
    const context = this.rootContext.clone({
      currentNode: node,
      currentNodeList: [node],
      position: 1,
    });
    if (namespaces) context.namespaces = namespaces;
    const value = this.evaluateXPath(expression, context);

    if (Array.isArray(value)) {
      return value.map((item) => this.xpathEvaluator.getStringValue(item));
    }
    return [this.xpathEvaluator.toString(value)];
  },
};
