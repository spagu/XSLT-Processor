/**
 * The XPath dynamic context of a transformation: the resources it reads
 * (documents, text, collections) with relative URIs resolved against the
 * base URI of the calling expression, and the documents it loads stripped
 * of whitespace by the xsl:strip-space rules of the package of that
 * expression (XSLT 3.0 section 4.3).
 *
 * @module @tradik/xslt3/xslt/runtime/transformationContext
 */

import { createDynamicContext } from "../../xpath/eval/dynamicContext.js";
import { resolveUri } from "../../xpath/eval/uris.js";
import { stripDocument } from "./strip.js";

/**
 * Whitespace stripping of loaded documents, once per document and rule
 * set, so that a document read twice by one package is one node.
 * @returns {(document: Node, rules: object[]) => Node}
 */
export function documentStripper() {
  const copies = new WeakMap();
  return (document, rules) => {
    if (document?.nodeType !== 9) return document;
    let byRules = copies.get(document);
    if (!byRules) copies.set(document, (byRules = new Map()));
    let stripped = byRules.get(rules);
    if (!stripped) {
      stripped = stripDocument(document, rules);
      byRules.set(rules, stripped);
    }
    return stripped;
  };
}

/**
 * Builds the dynamic context of a transformation.
 * @param {object} stylesheet - The top-level package's compiler
 * @param {object} options - See CompiledStylesheet.transform
 * @param {(document: Node, rules: object[]) => Node} strip - From
 *   {@link documentStripper}
 * @param {() => Document} createDocument
 * @returns {object}
 */
export function transformationContext(
  stylesheet,
  options,
  strip,
  createDocument,
) {
  const dyn = createDynamicContext(
    stylesheet.sc,
    {
      documentLoader: options.documentLoader,
      createDocument,
      implicitTimezone: options.implicitTimezone,
      currentDateTime: options.currentDateTime,
      textLoader: options.textLoader,
      xmlParser: options.xmlParser,
      collections: options.collections,
    },
    options.source,
  );
  const { loadDocument, loadText, collection } = dyn;
  /** @this {object} the dynamic context of the calling expression */
  function rulesOf() {
    return (this.sc?.owner ?? stylesheet).spaceRules ?? stylesheet.spaceRules;
  }
  // `this` is the dynamic context of the calling expression
  dyn.loadDocument = function load(uri) {
    const base = this.staticBaseUri;
    const document = loadDocument(resolveUri(uri, base), base);
    return strip(document, rulesOf.call(this));
  };
  dyn.loadText = function loadTextFrom(href, encoding) {
    return loadText(href, encoding, this.staticBaseUri);
  };
  dyn.collection = function collectionFrom(href) {
    const rules = rulesOf.call(this);
    return collection(href, this.staticBaseUri).map((item) =>
      strip(item, rules),
    );
  };
  dyn.xc = null;
  return dyn;
}
