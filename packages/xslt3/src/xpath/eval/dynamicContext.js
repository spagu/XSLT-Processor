/**
 * The dynamic context of one evaluation (XPath 3.1 section 2.1.2), shared
 * by every evaluator of the expression and passed to function
 * implementations: implicit timezone, current date and time (stable during
 * the evaluation), available documents, document order, collation.
 *
 * @module @tradik/xslt3/xpath/eval/dynamicContext
 */

import { XPathError } from "../../errors.js";
import { DateTimeValue } from "../../xdm/datetime.js";
import { Decimal } from "../../xdm/decimal.js";
import { DocumentOrder } from "./documentOrder.js";
import { deepEqualItem } from "../../functions/mapArrayEqual.js";
import { compareCodepoints } from "../../xdm/strings.js";
import { functionItemOf, resolveFunction } from "./functionItems.js";
import {
  createCollections,
  createTextLoader,
  createXmlParser,
} from "./resources.js";
import { resolveUri } from "./uris.js";

const XSL_NAMESPACE = "http://www.w3.org/1999/XSL/Transform";

/**
 * The date and time of a JS Date in a timezone.
 * @param {Date} date
 * @param {number} timezone - Offset in minutes
 * @returns {DateTimeValue}
 */
export function dateTimeOf(date, timezone) {
  const shifted = new Date(date.getTime() + timezone * 60000);
  const millis = shifted.getUTCMilliseconds();
  return new DateTimeValue({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: Decimal.of(BigInt(shifted.getUTCSeconds() * 1000 + millis), 3),
    timezone,
  });
}

/**
 * A document loader with the stability of fn:doc (the same URI gives the
 * same document during an evaluation). Raises FODC0005 for an invalid URI
 * (a colon not preceded by a valid scheme) and FODC0002 when the loader
 * fails or finds nothing.
 * @param {((uri: string, base?: string) => Node)|undefined} loader - Gets
 *   the absolute URI and the base URI it was resolved against
 * @param {string|undefined} baseUri
 * @returns {(uri: string, base?: string) => Node}
 */
function documentLoader(loader, baseUri) {
  const documents = new Map();
  return (uri, base = baseUri) => {
    const scheme = /^([^/?#]*):/.exec(uri);
    if (scheme && !/^[A-Za-z][A-Za-z0-9+.-]*$/.test(scheme[1])) {
      throw new XPathError("FODC0005", `Invalid URI ${uri}`);
    }
    const absolute = resolveUri(uri, base);
    if (documents.has(absolute)) return documents.get(absolute);
    let document;
    try {
      document = loader?.(absolute, base);
    } catch (error) {
      throw new XPathError("FODC0002", `Cannot load ${absolute}`, {
        cause: error,
      });
    }
    if (!document) {
      throw new XPathError("FODC0002", `No document at ${absolute}`);
    }
    documents.set(absolute, document);
    return document;
  };
}

/**
 * A factory of empty documents for functions that build nodes (such as
 * fn:analyze-string): the DOM implementation of the context node, else of
 * the global document.
 * @param {*} contextNode
 * @returns {() => Document}
 */
function documentFactory(contextNode) {
  return () => {
    const owner = contextNode?.ownerDocument ?? contextNode;
    const implementation =
      owner?.implementation ?? globalThis.document?.implementation;
    if (!implementation) {
      throw new XPathError(
        "XPDY0130",
        "No DOM implementation to build nodes with: pass createDocument",
      );
    }
    return implementation.createDocument(null, null, null);
  };
}

/**
 * Creates the dynamic context of an evaluation.
 * @param {import("./staticContext.js").StaticContext} sc
 * @param {object} options - Dynamic options (see xpath/index.js)
 * @param {*} [contextNode] - Context item, whose DOM builds new nodes when
 *   `options.createDocument` is absent
 * @returns {object} the dynamic context
 */
export function createDynamicContext(sc, options, contextNode) {
  const implicitTimezone = options.implicitTimezone ?? 0;
  const now = options.currentDateTime;
  const currentDateTime =
    now instanceof DateTimeValue
      ? now
      : dateTimeOf(now ?? new Date(), implicitTimezone);
  const compareOptions = { implicitTimezone };
  return {
    implicitTimezone,
    currentDateTime,
    defaultCollation: sc.defaultCollation,
    staticBaseUri: sc.baseUri,
    defaultLanguage: "en",
    contextItem: undefined,
    position: 0,
    size: 0,
    loadDocument: documentLoader(options.documentLoader, sc.baseUri),
    loadText: createTextLoader(options.textLoader, sc.baseUri),
    parseXml: createXmlParser(options.xmlParser),
    collection: createCollections(options.collections, sc.baseUri),
    trace: options.trace ?? (() => {}),
    decimalFormats: sc.decimalFormats,
    createDocument: options.createDocument ?? documentFactory(contextNode),
    deepEqualItem: function hook(a, b, itemOptions) {
      return deepEqualItem(a, b, {
        ...compareOptions,
        collation: compareCodepoints,
        deepEqualItem: hook,
        ...itemOptions,
      });
    },
    order: options.documentOrder ?? new DocumentOrder(),
    // Set by the owner of an evaluation (see descendantMemo.js)
    descendantMemo: null,
    compareOptions,
    compatibleCompareOptions: { ...compareOptions, backwardsCompatible: true },
    lookupFunction(uri, local, arity, ctx) {
      // xsl:original is only reachable by a static call (XSLT 3.0 3.5.3)
      if (uri === XSL_NAMESPACE) return null;
      try {
        // the static context of the calling expression, when one is set
        const callSc = this.sc ?? sc;
        return functionItemOf(resolveFunction(uri, local, arity, callSc), ctx);
      } catch (error) {
        if (error.code === "XPST0017") return null;
        throw error;
      }
    },
  };
}
