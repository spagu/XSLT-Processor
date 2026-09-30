/**
 * Asynchronous XSLTProcessor Methods
 *
 * Implementation of `importStylesheetAsync`, `transformAsync` and
 * `transformToStream` of {@link XSLTProcessor}. The transformation itself
 * stays synchronous (XPath evaluation cannot await): the asynchronous work is
 * reading the inputs and preloading what the stylesheet references, before
 * the synchronous compile and transform.
 *
 * @module async/processor
 */

import { readSource } from "../io/readSource.js";
import { toChunkSize } from "../xslt/serializer/chunks.js";
import { throwIfAborted } from "./abort.js";
import { createDocumentFetcher, resolveAsyncLoader } from "./loaders.js";
import {
  preloadDocuments,
  preloadModules,
  preloadedStylesheetLoader,
} from "./preload.js";
import { chunkStream, transformToChunks } from "./stream.js";

/**
 * Reject a configured loader that is not a function.
 *
 * @param {Function|null|undefined} loader - Configured loader
 * @returns {void}
 * @throws {TypeError} When `loader` is set but not a function
 */
function checkLoader(loader) {
  if (loader !== undefined && loader !== null) resolveAsyncLoader(loader);
}

/**
 * A loader that is resolved when first used, so that a stylesheet without
 * external references needs neither a loader nor `fetch`.
 *
 * @param {Function|null|undefined} loader - Configured loader
 * @returns {Function} The lazy loader
 */
function lazyLoader(loader) {
  return (...args) => resolveAsyncLoader(loader)(...args);
}

/**
 * The document owning a node (for its window's DOMParser).
 *
 * @param {Node} node - A node
 * @returns {Document} The owner document
 */
function ownerOf(node) {
  return node.ownerDocument ?? node;
}

/**
 * Load the documents of the literal `document()` calls of stylesheet modules.
 *
 * @param {Node[]} modules - The stylesheet modules
 * @param {string|undefined} stylesheetUri - URI of the main stylesheet
 * @param {Function|null|undefined} loader - Asynchronous document loader
 * @param {AbortSignal} [signal] - Optional signal
 * @returns {Promise<Map<string, object>>} Preloaded outcomes by URI
 */
async function preloadStaticDocuments(modules, stylesheetUri, loader, signal) {
  const fetchDocument = createDocumentFetcher(lazyLoader(loader), {
    signal,
    referenceDoc: ownerOf(modules[0]),
  });
  const documents = await preloadDocuments(
    modules,
    stylesheetUri,
    fetchDocument,
    signal,
  );
  throwIfAborted(signal);
  return documents;
}

/**
 * Import a stylesheet whose `xsl:import`/`xsl:include` modules and literal
 * `document()` documents are loaded asynchronously first.
 *
 * @param {import('../XSLTProcessor.js').XSLTProcessor} processor - Processor
 * @param {Node|string|Uint8Array|ArrayBuffer|ReadableStream|AsyncIterable} style -
 *   The stylesheet, as a node or as markup (read and parsed first)
 * @param {string} [stylesheetUri] - Base URI of relative hrefs and document() URIs
 * @param {object} [options] - Loading options
 * @param {Function} [options.loader] - Asynchronous stylesheet loader, `fetch` by default
 * @param {Function} [options.documentLoader] - Asynchronous document() loader,
 *   `options.loader` by default
 * @param {AbortSignal} [options.signal] - Cancels loading
 * @returns {Promise<void>} Resolves once the stylesheet is compiled
 */
export async function importStylesheetAsync(
  processor,
  style,
  stylesheetUri,
  options = {},
) {
  const { signal, loader } = options;
  const documentLoader = options.documentLoader ?? loader;
  checkLoader(loader);
  checkLoader(documentLoader);

  const node = await readSource(style, { signal });
  const modules = await preloadModules(
    node,
    stylesheetUri,
    createDocumentFetcher(lazyLoader(loader), {
      signal,
      referenceDoc: ownerOf(node),
    }),
  );
  const allModules = [node, ...modules.values()];
  const documents = await preloadStaticDocuments(
    allModules,
    stylesheetUri,
    documentLoader,
    signal,
  );

  processor._compile(node, stylesheetUri, {
    stylesheetLoader: preloadedStylesheetLoader(modules),
    modules: allModules,
    documents,
  });
}

/**
 * Transform asynchronously: read the source (node, markup or stream),
 * optionally import a stylesheet or preload `document()` documents first,
 * then transform and serialize.
 *
 * @param {import('../XSLTProcessor.js').XSLTProcessor} processor - Processor
 * @param {Node|string|Uint8Array|ArrayBuffer|ReadableStream|AsyncIterable} source - Input
 * @param {object} [options] - Options
 * @param {AbortSignal} [options.signal] - Cancels the call
 * @param {Node|string|ReadableStream|AsyncIterable} [options.stylesheet] -
 *   Stylesheet to import first (see importStylesheetAsync)
 * @param {string} [options.stylesheetUri] - Its URI
 * @param {Function} [options.fetchStylesheet] - Asynchronous stylesheet loader
 * @param {Function} [options.fetchDocument] - Asynchronous document() loader
 * @returns {Promise<string>} The serialized result
 * @throws {Error} When loading, parsing or the transformation fails
 */
export async function transformAsync(processor, source, options = {}) {
  const { signal, stylesheet, fetchStylesheet, fetchDocument } = options;
  if (stylesheet !== undefined && stylesheet !== null) {
    await importStylesheetAsync(processor, stylesheet, options.stylesheetUri, {
      loader: fetchStylesheet,
      documentLoader: fetchDocument,
      signal,
    });
  } else {
    processor._requireStylesheet("transformAsync");
    if (fetchDocument) {
      checkLoader(fetchDocument);
      processor._usePreloadedDocuments(
        await preloadStaticDocuments(
          processor._modules,
          processor._stylesheetUri,
          fetchDocument,
          signal,
        ),
      );
    }
  }
  const node = await readSource(source, {
    signal,
    referenceDoc: ownerOf(processor._stylesheet),
  });
  processor._checkSource("transformAsync", node);
  throwIfAborted(signal);
  return processor.engine.transformToString(node);
}

/**
 * Transform and stream the serialized result (see async/stream.js).
 *
 * @param {import('../XSLTProcessor.js').XSLTProcessor} processor - Processor
 * @param {Node|string|Uint8Array|ArrayBuffer|ReadableStream|AsyncIterable} source - Input
 * @param {{signal?: AbortSignal, chunkSize?: number}} [options] - Options
 * @returns {ReadableStream<string>} The serialized result
 * @throws {TypeError|RangeError} For a missing stylesheet, an invalid source
 *   node or chunk size (at once; later failures error the stream)
 */
export function transformToStream(processor, source, options = {}) {
  processor._requireStylesheet("transformToStream");
  if (typeof source?.nodeType === "number") {
    processor._checkSource("transformToStream", source);
  }
  const chunkSize = toChunkSize(options.chunkSize);
  const engine = processor.engine;
  const { signal } = options;
  return chunkStream(async () => {
    const node = await readSource(source, {
      signal,
      referenceDoc: ownerOf(processor._stylesheet),
    });
    processor._checkSource("transformToStream", node);
    return transformToChunks(engine, node, { chunkSize });
  }, options);
}
