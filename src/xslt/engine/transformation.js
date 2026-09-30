/**
 * Transformation entry points: building the result tree and shaping it as
 * a fragment, a document or a string.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { WhitespaceFilter, stripWhitespaceNodes } from "../whitespace.js";
import {
  createResultDocument,
  importResultFragment,
  isHtmlDocument,
  parseHtmlFragment,
  wrapTextResult,
} from "../resultTree.js";
import { resolveOutputSettings, serializeResult } from "../serializer.js";
import { fillXmlDocument, parseHtmlDocument } from "../resultDocument.js";
import { XsltContext } from "./context.js";
import {
  DocumentOrderIndex,
  hasNativePositionComparison,
} from "../../xpath/documentOrder.js";

/**
 * Turn a JavaScript stack overflow into a clear transformation error; any
 * other error is returned unchanged.
 *
 * @param {Error} error - The error thrown by a transformation
 * @returns {Error} The error to report
 */
function recursionError(error) {
  const isStackOverflow =
    (error instanceof RangeError && /call stack/i.test(error.message)) ||
    // Firefox reports "InternalError: too much recursion"
    (error?.name === "InternalError" && /recursion/i.test(error.message));
  if (!isStackOverflow) return error;

  return new Error(
    "Template recursion too deep: the transformation exceeded the JavaScript " +
      "call stack (infinite recursion, or recursion deeper than the runtime allows)",
    { cause: error },
  );
}

export const transformationMethods = {
  /**
   * Transform a source node into a fragment owned by `ownerDocument`, built
   * with the XML DOM (names and namespaces as in the result tree).
   *
   * @param {Node} sourceNode - Source document or element
   * @param {Document} [ownerDocument] - Output document, default the global one
   * @returns {DocumentFragment} The result
   */
  transform(sourceNode, ownerDocument) {
    const doc = this.outputDocumentOf(ownerDocument);
    return importResultFragment(this.buildResultTree(sourceNode, doc), doc);
  },

  /**
   * Transform a source node into a fragment of `ownerDocument` as Chrome's
   * `transformToFragment` does: into an HTML document, the output of the
   * html method (declared or detected) is serialized and parsed as HTML, so
   * it holds HTMLElements, and other output keeps its nodes except that
   * elements in no namespace become XHTML elements (as in Chrome and
   * Firefox); into an XML document the result nodes are kept.
   *
   * @param {Node} sourceNode - Source document or element
   * @param {Document} ownerDocument - Output document
   * @returns {DocumentFragment} The result
   */
  transformToFragment(sourceNode, ownerDocument) {
    const doc = this.outputDocumentOf(ownerDocument);
    const fragment = this.buildResultTree(sourceNode, doc);
    const settings = resolveOutputSettings(this.outputSettings, fragment);
    if (isHtmlDocument(doc) && settings.method === "html") {
      return parseHtmlFragment(
        serializeResult(fragment, this.outputSettings),
        doc,
      );
    }
    return importResultFragment(fragment, doc, { htmlElements: true });
  },

  /**
   * The document that owns a transformation result.
   *
   * @param {Document} [ownerDocument] - Requested owner
   * @returns {Document} The owner, else the global document
   * @throws {Error} When there is no document at all
   */
  outputDocumentOf(ownerDocument) {
    const doc =
      ownerDocument || (typeof document !== "undefined" ? document : null);

    if (!doc) {
      throw new Error("No output document available");
    }
    return doc;
  },

  /**
   * Run the transformation and return the result tree, built in a neutral
   * XML document: creating nodes directly in an HTML owner document would
   * lower case names and force the XHTML namespace on every element.
   *
   * The templates are applied to the document node (not the document
   * element), so the "/" template has the document as context node and
   * paths such as "RootElement/child" work.
   *
   * @param {Node} sourceNode - Source document or element
   * @param {Document} doc - Document providing the DOM implementation
   * @returns {DocumentFragment} The result tree
   */
  buildResultTree(sourceNode, doc) {
    const resultDocument = createResultDocument(doc);
    const source = this.initialNode(this.prepareSource(sourceNode, doc));

    const context = new XsltContext({
      currentNode: source,
      currentNodeList: [source],
      position: 1,
      outputDocument: resultDocument,
      stylesheet: this.stylesheetDoc,
      namespaces: this.namespaces,
      templates: this.templates,
      keys: this.keys,
      decimalFormats: this.decimalFormats,
      outputMethod: this.outputSettings.method,
      xpathEvaluator: this.xpathEvaluator,
    });

    this.rootContext = context;
    // The source tree may have changed since the previous transformation
    this.keyRegistry.clear();
    this.patternMatcher.reset();
    this.xpathEvaluator.resetNamespaceNodes();
    // Document order from positions numbered once, unless the DOM compares
    // positions natively (see documentOrder.js)
    this.xpathEvaluator.resetDocumentOrder(
      hasNativePositionComparison(source) ? null : new DocumentOrderIndex(),
    );
    this.numberMemos = new WeakMap();

    const fragment = resultDocument.createDocumentFragment();
    try {
      context.globals = this.createGlobals(context);
      context.globals.evaluateAll();
      this.applyTemplates([source], null, context, fragment);
    } catch (error) {
      throw recursionError(error);
    }
    return fragment;
  },

  /**
   * Choose the node the transformation starts from.
   *
   * A document element is transformed through its document, so that the "/"
   * template rule applies as for a whole document (as browsers do); any other
   * node is transformed as is.
   *
   * @param {Node} source - The (prepared) source node
   * @returns {Node} The initial context node
   */
  initialNode(source) {
    const owner = source.ownerDocument;
    return source.nodeType === 1 && owner?.documentElement === source
      ? owner
      : source;
  },

  /**
   * Apply `xsl:strip-space` to the source tree.
   *
   * Stripping produces a copy so the caller's document is never modified; when
   * no `xsl:strip-space` is declared the original node is used unchanged.
   *
   * @param {Node} sourceNode - The source document or element
   * @param {Document} ownerDocument - Document providing the DOM implementation
   * @returns {Node} The source to transform
   */
  prepareSource(sourceNode, ownerDocument) {
    const filter = new WhitespaceFilter(this.stripSpace, this.preserveSpace);
    if (!filter.isActive()) return sourceNode;

    return stripWhitespaceNodes(
      sourceNode,
      filter,
      createResultDocument(ownerDocument),
    );
  },

  /**
   * Transform to a complete document, shaped as Chrome's XSLTProcessor
   * returns it (see resultDocument.js): with `method="text"` an XHTML page
   * holding the text in a `pre` element (see wrapTextResult), with the html
   * method (declared or detected) an HTML document parsed from the html
   * output, otherwise an XML document of the result nodes.
   *
   * @param {Node} sourceNode - Source document or element to transform
   * @returns {Document} The result document
   */
  transformToDocument(sourceNode) {
    const doc = this.createDocument(sourceNode);
    const fragment = this.transform(sourceNode, doc);

    if (this.outputSettings.method === "text") {
      return wrapTextResult(doc, fragment.textContent);
    }
    const settings = resolveOutputSettings(this.outputSettings, fragment);
    if (settings.method === "html") {
      const markup = serializeResult(fragment, this.outputSettings);
      const htmlDoc = parseHtmlDocument(markup, doc);
      if (htmlDoc) return htmlDoc;
    }
    return fillXmlDocument(doc, fragment, settings);
  },

  /**
   * Transform a source document and serialize the result to a string.
   *
   * Non-W3C convenience method: the result tree is serialized honoring the
   * `xsl:output` settings of the stylesheet (XSLT 1.0 section 16).
   *
   * @param {Node} sourceNode - Source document or element to transform
   * @returns {string} The serialized transformation result
   */
  transformToString(sourceNode) {
    const fragment = this.buildResultTree(
      sourceNode,
      this.createDocument(sourceNode),
    );
    return serializeResult(fragment, this.outputSettings);
  },

  /**
   * Create an empty XML document to hold a transformation result.
   *
   * Uses the global `document` when running in a browser and otherwise falls
   * back to the DOM implementation owning `referenceNode` (e.g. a jsdom or
   * xmldom document in Node.js).
   *
   * @param {Node} [referenceNode] - Any node whose DOM implementation can be reused
   * @returns {Document} A new empty document
   * @throws {Error} When no DOM implementation is available
   */
  createDocument(referenceNode) {
    if (typeof document !== "undefined") {
      return document.implementation.createDocument(null, null, null);
    }

    const ownerDocument =
      referenceNode &&
      (referenceNode.nodeType === 9
        ? referenceNode
        : referenceNode.ownerDocument);
    if (ownerDocument?.implementation) {
      return ownerDocument.implementation.createDocument(null, null, null);
    }

    throw new Error("Document creation not available in this environment");
  },
};
