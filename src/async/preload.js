/**
 * Stylesheet and Document Preloading
 *
 * The XSLT engine compiles and transforms synchronously. To use asynchronous
 * loaders (`fetch`), everything the engine will ask for is loaded first:
 *
 * 1. the `xsl:import`/`xsl:include` tree, breadth first, every module in
 *    parallel and each URI once (diamond imports share one load). A cycle
 *    cannot make preloading loop, since a URI is never loaded twice; it is
 *    reported by the engine while compiling ("Circular stylesheet reference
 *    detected"), exactly as with a synchronous loader;
 * 2. the documents named by literal `document('...')` calls of every module
 *    (see documentUris.js).
 *
 * The preloaded documents are then served by synchronous loaders, falling
 * back to the synchronous loaders configured on the processor.
 *
 * @module async/preload
 */

import { resolveUri } from "../xslt/uri.js";
import { XSLT_NAMESPACE } from "../xslt/elements.js";
import { staticDocumentUris } from "./documentUris.js";

/**
 * The resolved hrefs of the `xsl:import` and `xsl:include` elements of a
 * stylesheet module (top-level children of its root element).
 *
 * @param {Node} module - Stylesheet document or root element
 * @param {string|undefined} moduleUri - URI of the module
 * @returns {string[]} Resolved URIs, in document order
 */
export function moduleReferences(module, moduleUri) {
  const root = module.documentElement ?? module;
  const uris = [];
  for (const child of root.childNodes) {
    const isReference =
      child.nodeType === 1 &&
      child.namespaceURI === XSLT_NAMESPACE &&
      (child.localName === "import" || child.localName === "include");
    const href = isReference ? child.getAttribute("href") : null;
    if (href) uris.push(resolveUri(href, moduleUri));
  }
  return uris;
}

/**
 * Load the whole import/include tree of a stylesheet.
 *
 * @param {Node} style - The main stylesheet (document or root element)
 * @param {string|undefined} stylesheetUri - Its URI (base of relative hrefs)
 * @param {(uri: string, baseUri?: string) => Promise<Document|null>} fetchDocument -
 *   De-duplicating loader (see createDocumentFetcher)
 * @returns {Promise<Map<string, Document>>} Every module by resolved URI
 * @throws {Error} When a module cannot be loaded
 *
 * @example
 * const modules = await preloadModules(xslDoc, "/xsl/main.xsl", load);
 */
export async function preloadModules(style, stylesheetUri, fetchDocument) {
  const modules = new Map();
  const seen = new Set(stylesheetUri ? [stylesheetUri] : []);
  let level = [{ module: style, uri: stylesheetUri }];

  while (level.length > 0) {
    const requests = [];
    for (const { module, uri } of level) {
      for (const target of moduleReferences(module, uri)) {
        if (seen.has(target)) continue;
        seen.add(target);
        requests.push(loadModule(target, uri, fetchDocument));
      }
    }
    level = await Promise.all(requests);
    for (const { module, uri } of level) modules.set(uri, module);
  }
  return modules;
}

/**
 * Load one stylesheet module.
 *
 * @param {string} uri - Resolved URI
 * @param {string|undefined} baseUri - URI of the referencing module
 * @param {(uri: string, baseUri?: string) => Promise<Document|null>} fetchDocument - Loader
 * @returns {Promise<{module: Document, uri: string}>} The module
 * @throws {Error} When the loader fails or returns nothing
 */
async function loadModule(uri, baseUri, fetchDocument) {
  const module = await fetchDocument(uri, baseUri);
  if (!module) throw new Error(`Cannot load stylesheet "${uri}"`);
  return { module, uri };
}

/**
 * Load the documents named by literal `document()` calls. A failed load is
 * not reported here: it is kept and reported when the transformation actually
 * evaluates that call (it may sit in a branch that never runs). Aborting
 * rejects at once.
 *
 * @param {Array<Node>} modules - Stylesheet modules to scan
 * @param {string|undefined} stylesheetUri - Base URI of `document()` calls
 * @param {(uri: string, baseUri?: string) => Promise<Document|null>} fetchDocument - Loader
 * @param {AbortSignal} [signal] - Optional signal
 * @returns {Promise<Map<string, {document?: Document|null, error?: Error}>>}
 *   Outcome by resolved URI
 */
export async function preloadDocuments(
  modules,
  stylesheetUri,
  fetchDocument,
  signal,
) {
  const uris = new Set(
    modules.flatMap((module) => staticDocumentUris(module, stylesheetUri)),
  );
  const outcomes = await Promise.all(
    [...uris].map((uri) =>
      fetchDocument(uri, stylesheetUri).then(
        (document) => ({ document }),
        (error) => {
          if (signal?.aborted) throw error;
          return { error };
        },
      ),
    ),
  );
  return new Map([...uris].map((uri, index) => [uri, outcomes[index]]));
}

/**
 * Synchronous stylesheet loader serving the preloaded modules. Every href of
 * the import tree is literal, so every module the engine asks for while
 * compiling has been preloaded.
 *
 * @param {Map<string, Document>} modules - Preloaded modules by resolved URI
 * @returns {(href: string) => Document} The loader
 */
export function preloadedStylesheetLoader(modules) {
  return (href) => modules.get(href);
}

/**
 * Synchronous `document()` loader serving preloaded documents first; a
 * preload failure is thrown when the document is actually needed.
 *
 * @param {Map<string, {document?: Document|null, error?: Error}>} documents -
 *   Preloaded outcomes
 * @param {Function|null} fallback - Loader configured on the processor
 * @returns {(uri: string, baseUri?: string) => (Document|string|null)} The loader
 */
export function preloadedDocumentLoader(documents, fallback) {
  return (uri, baseUri) => {
    const outcome = documents.get(uri);
    if (outcome?.error) throw outcome.error;
    if (outcome) return outcome.document;
    return fallback ? fallback(uri, baseUri) : null;
  };
}
