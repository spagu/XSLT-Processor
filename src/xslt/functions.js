/**
 * XSLT-defined XPath functions.
 *
 * XSLT 1.0 section 12 adds functions to the XPath function library. They live
 * here rather than in `src/xpath` so that module stays a pure XPath 1.0
 * implementation; the engine registers this map on its evaluator through
 * {@link XPathEvaluator#registerFunctions}.
 */

"use strict";

import { formatNumber, DEFAULT_DECIMAL_FORMAT } from "./formatNumber.js";
import { isXsltElementAvailable, XSLT_NAMESPACE } from "./elements.js";

/** Vendor identification reported by `system-property()`. */
export const VENDOR = "@tradik/xslt-processor";

/** Vendor URL reported by `system-property()`. */
export const VENDOR_URL = "https://github.com/spagu/XSLT-Processor";

/**
 * Values reported by `system-property()`, keyed by property name.
 *
 * The XSLT version is reported as the string `"1"`; XPath 1.0 converts it to
 * the number 1 wherever a numeric comparison or arithmetic is used.
 */
const SYSTEM_PROPERTIES = Object.freeze({
  "xsl:version": "1",
  "xsl:vendor": VENDOR,
  "xsl:vendor-url": VENDOR_URL,
});

/**
 * Get the document that owns a node.
 *
 * @param {Node} node - Any node
 * @returns {Document} The owning document, or the node when it is a document
 */
function ownerDocumentOf(node) {
  return node.ownerDocument || node;
}

/**
 * Convert an evaluated argument to the list of strings it denotes.
 *
 * Node-sets yield the string value of every node, other types yield one string.
 *
 * @param {XPathEvaluator} evaluator - The evaluator providing the conversions
 * @param {(value: *) => string} stringify - The XPath `string()` conversion
 * @param {*} value - An evaluated XPath value
 * @returns {string[]} The string values
 */
function toStringList(evaluator, stringify, value) {
  if (Array.isArray(value)) {
    return value.map((node) => evaluator.getStringValue(node));
  }
  return [stringify(value)];
}

/**
 * Split a QName into its prefix and local part.
 *
 * @param {string} qname - A possibly prefixed name
 * @returns {{prefix: (string|null), localName: string}} The parts of the name
 */
function splitQName(qname) {
  const colon = qname.indexOf(":");
  if (colon === -1) return { prefix: null, localName: qname };
  return {
    prefix: qname.substring(0, colon),
    localName: qname.substring(colon + 1),
  };
}

/**
 * Build the XSLT function map for an engine.
 *
 * @param {import('./engine.js').XsltEngine} engine - The engine providing loaders, keys and formats
 * @returns {Object<string, Function>} Functions ready for `registerFunctions`
 *
 * @example
 * evaluator.registerFunctions(createXsltFunctions(engine));
 */
export function createXsltFunctions(engine) {
  const evaluator = engine.xpathEvaluator;

  /**
   * The XPath `string()` conversion of the evaluator.
   *
   * `XPathEvaluator#toString` shadows `Object#toString` and takes the value to
   * convert as its argument, so it is bound once under an unambiguous name.
   *
   * @type {(value: *) => string}
   */
  const stringify = evaluator.toString.bind(evaluator);
  const evaluate = (arg, ctx) => evaluator.evaluate(arg, ctx);
  const asString = (arg, ctx) => stringify(evaluate(arg, ctx));

  return {
    /**
     * `document(object, base?)` - load external XML documents.
     *
     * An empty URI denotes the stylesheet itself. Without a document loader, or
     * when the loader returns null, the result is an empty node-set. The
     * optional second argument is read as a base URI string.
     */
    document: (args, ctx) => {
      const baseUri = args.length > 1 ? asString(args[1], ctx) : engine.baseUri;
      const uris = toStringList(evaluator, stringify, evaluate(args[0], ctx));
      const result = [];

      for (const uri of uris) {
        const doc = engine.loadDocument(uri, baseUri || engine.baseUri);
        if (doc && !result.includes(doc)) result.push(doc);
      }

      return result;
    },

    /** `key(name, value)` - look up nodes through an `xsl:key` index. */
    key: (args, ctx) => {
      const name = asString(args[0], ctx);
      const values = toStringList(evaluator, stringify, evaluate(args[1], ctx));
      return engine.keyRegistry.lookup(name, values, ownerDocumentOf(ctx.node));
    },

    /** `format-number(number, pattern, decimalFormat?)`. */
    "format-number": (args, ctx) => {
      const value = evaluator.toNumber(evaluate(args[0], ctx));
      const pattern = asString(args[1], ctx);
      const formatName = args.length > 2 ? asString(args[2], ctx) : "";
      const format =
        engine.decimalFormats[formatName] || DEFAULT_DECIMAL_FORMAT;
      return formatNumber(value, pattern, format);
    },

    /** `current()` - the XSLT current node, not the XPath context node. */
    current: (args, ctx) => {
      const currentNode = ctx.hostContext?.currentNode;
      return currentNode ? [currentNode] : [ctx.node];
    },

    /** `generate-id(node-set?)` - a stable id for the life of the transform. */
    "generate-id": (args, ctx) => {
      let node = ctx.node;

      if (args.length > 0) {
        const nodeSet = evaluate(args[0], ctx);
        node = Array.isArray(nodeSet) ? nodeSet[0] : nodeSet;
      }

      return node ? engine.generateId(node) : "";
    },

    /** `system-property(name)` - XSLT version and vendor information. */
    "system-property": (args, ctx) => {
      const name = asString(args[0], ctx);
      return Object.hasOwn(SYSTEM_PROPERTIES, name)
        ? SYSTEM_PROPERTIES[name]
        : "";
    },

    /** `function-available(name)` - reflects the evaluator function table. */
    "function-available": (args, ctx) => {
      const name = asString(args[0], ctx);
      return Object.hasOwn(evaluator.functions, name);
    },

    /** `element-available(name)` - reflects the XSLT elements the engine runs. */
    "element-available": (args, ctx) => {
      const { prefix, localName } = splitQName(asString(args[0], ctx));
      if (!prefix) return false;

      const namespaceUri =
        ctx.namespaces[prefix] ?? (prefix === "xsl" ? XSLT_NAMESPACE : null);

      return (
        namespaceUri === XSLT_NAMESPACE && isXsltElementAvailable(localName)
      );
    },

    /**
     * `unparsed-entity-uri(name)` - always empty.
     *
     * Unparsed entity declarations are not exposed by the DOM, so this
     * processor cannot resolve them; returning the empty string keeps
     * stylesheets that call the function working.
     */
    "unparsed-entity-uri": () => "",
  };
}
