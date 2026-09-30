/**
 * XSLT Processor CLI - DOM implementations
 *
 * The library has no runtime dependencies: in Node.js the host brings a DOM.
 * The command line tool (and the test suites) can run on two of them, both
 * optional peer dependencies:
 *
 * - `jsdom`: the complete one, with HTML documents (the default);
 * - `@xmldom/xmldom`: a small XML-only DOM, faster to load; it is used when
 *   jsdom is not installed, or when chosen with `XSLT_DOM=xmldom`.
 *
 * Both are exposed through the same shape as a JSDOM instance
 * (`{ window: { document, DOMParser, XMLSerializer } }`), so callers never
 * need to know which one they got.
 *
 * @module bin/lib/dom
 */

"use strict";

/** Names of the supported DOM implementations, in order of preference. */
export const DOM_IMPLEMENTATIONS = Object.freeze(["jsdom", "xmldom"]);

/**
 * Loader of each supported DOM implementation. The specifiers are literal so
 * that bundlers (the standalone binaries, see scripts/binaries/bundle.mjs)
 * can follow them.
 */
const IMPORTERS = Object.freeze({
  jsdom: () => import("jsdom"),
  xmldom: () => import("@xmldom/xmldom"),
});

/** Message shown when no DOM implementation is installed. */
export const DOM_MISSING_MESSAGE =
  "The xslt command needs a DOM implementation, an optional peer dependency " +
  "that is not installed. Install jsdom or @xmldom/xmldom (lighter, XML only) " +
  "next to this package: npm install -g jsdom (global install) " +
  "or npm install jsdom (project install).";

/**
 * @typedef {Object} DomEnvironment
 * @property {string} name - "jsdom" or "xmldom"
 * @property {{document: Document, DOMParser: Function, XMLSerializer: Function}} window -
 *   The DOM classes, and the document results are created with
 */

/**
 * Whether an import failed because the package is not installed.
 *
 * @param {*} error - The rejection of a dynamic import
 * @returns {boolean} True for a missing module
 */
function isMissingModule(error) {
  return (
    error?.code === "ERR_MODULE_NOT_FOUND" || error?.code === "MODULE_NOT_FOUND"
  );
}

/** The xmldom warning about well-formed markup. */
const BENIGN_WARNING = /^Unicode replacement character/;

/**
 * A DOMParser class for xmldom that reports malformed XML as browsers do:
 * a document holding a `parsererror` element instead of a thrown ParseError
 * or a message on the console. xmldom only warns about some malformed
 * markup (unquoted attribute values, attributes without a space between
 * them), which browsers reject too, so warnings count as errors, except
 * the one about U+FFFD characters (well formed). Lenient `text/html`
 * parsing never fails.
 *
 * @param {object} xmldom - The @xmldom/xmldom module
 * @returns {Function} The DOMParser class
 */
function createXmldomParser(xmldom) {
  return class DOMParser {
    /**
     * @param {string} text - Markup
     * @param {string} type - MIME type ("application/xml", "text/html", ...)
     * @returns {Document} The parsed document, or a parsererror document
     */
    parseFromString(text, type) {
      let failure = null;
      const onError = (level, message) => {
        if (type === "text/html" || BENIGN_WARNING.test(message)) return;
        failure ??= message;
        throw new Error(message);
      };
      try {
        return new xmldom.DOMParser({ onError }).parseFromString(text, type);
      } catch (error) {
        const doc = new xmldom.DOMImplementation().createDocument(
          null,
          "parsererror",
          null,
        );
        doc.documentElement.appendChild(
          doc.createTextNode(failure ?? error.message),
        );
        return doc;
      }
    }
  };
}

/**
 * Build the environment of one DOM implementation from its module.
 *
 * @param {string} name - "jsdom" or "xmldom"
 * @param {object} module - The imported package
 * @returns {DomEnvironment} The environment
 */
function environmentOf(name, module) {
  if (name === "jsdom") {
    const dom = new module.JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
    dom.name = "jsdom";
    return dom;
  }
  return {
    name,
    window: {
      document: new module.DOMImplementation().createDocument(null, null),
      DOMParser: createXmldomParser(module),
      XMLSerializer: module.XMLSerializer,
    },
  };
}

/**
 * Load a DOM implementation: the one named, else the first installed of
 * {@link DOM_IMPLEMENTATIONS}.
 *
 * @param {string} [name] - "jsdom" or "xmldom"; empty for the first installed
 * @param {Record<string, () => Promise<object>>} [importers] - Module loaders
 *   by implementation name (for tests)
 * @returns {Promise<DomEnvironment>} The environment (not installed globally)
 * @throws {Error} When the name is unknown or no implementation is installed
 *
 * @example
 * const dom = await loadDomEnvironment("xmldom");
 * new dom.window.DOMParser().parseFromString("<a/>", "application/xml");
 */
export async function loadDomEnvironment(name, importers = IMPORTERS) {
  if (name && !DOM_IMPLEMENTATIONS.includes(name)) {
    throw new Error(
      `Unknown DOM implementation "${name}": expected ${DOM_IMPLEMENTATIONS.join(" or ")}`,
    );
  }
  const candidates = name ? [name] : DOM_IMPLEMENTATIONS;
  let missing = null;
  for (const candidate of candidates) {
    try {
      return environmentOf(candidate, await importers[candidate]());
    } catch (error) {
      if (!isMissingModule(error)) throw error;
      missing ??= error;
    }
  }
  throw new Error(DOM_MISSING_MESSAGE, { cause: missing });
}

/**
 * Expose a DOM environment globally: the XSLT engine builds its results in
 * the global `document` and parses imported stylesheets given as strings
 * with the global `DOMParser`.
 *
 * @param {DomEnvironment} dom - The environment
 * @returns {DomEnvironment} The same environment
 */
export function installDomGlobals(dom) {
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
  return dom;
}
