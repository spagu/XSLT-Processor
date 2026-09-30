/**
 * Asynchronous Loaders
 *
 * An asynchronous loader fetches a stylesheet module or a `document()`
 * document before the synchronous transformation runs:
 *
 *     (uri, baseUri, { signal }) => Promise<Document | string | Uint8Array |
 *                                          ArrayBuffer | Response | null>
 *
 * `uri` is already resolved against `baseUri` (as for the synchronous
 * loaders). Strings are parsed; bytes and `Response` bodies are decoded like
 * files (byte order mark, XML declaration encoding, else UTF-8). Without a
 * loader, the global `fetch` is used when there is one (browsers, Node.js
 * for http(s) URIs).
 *
 * @module async/loaders
 */

import { decodeXml } from "../io/decode.js";
import { parseXml, resolveDomParser } from "../xslt/domParsing.js";
import { abortable } from "./abort.js";

/**
 * @typedef {(uri: string, baseUri: string|undefined, init: {signal?: AbortSignal}) =>
 *   Promise<Document|string|Uint8Array|ArrayBuffer|Response|null>|Document|string|null} AsyncLoader
 */

/**
 * Loader reading a URI with the global `fetch`.
 *
 * @param {string} uri - The resolved URI
 * @param {string} [_baseUri] - Unused
 * @param {{signal?: AbortSignal}} [init] - Fetch options
 * @returns {Promise<Response>} The response
 */
function fetchLoader(uri, _baseUri, init = {}) {
  return globalThis.fetch(uri, { signal: init.signal });
}

/**
 * The loader to use: the given one, else `fetch` when available.
 *
 * @param {AsyncLoader|null|undefined} loader - Configured loader
 * @returns {AsyncLoader} A loader
 * @throws {TypeError} When `loader` is not a function, or none is given and
 *   there is no global fetch
 */
export function resolveAsyncLoader(loader) {
  if (loader !== undefined && loader !== null) {
    if (typeof loader !== "function") {
      throw new TypeError("The loader must be a function");
    }
    return loader;
  }
  if (typeof globalThis.fetch !== "function") {
    throw new TypeError(
      "No loader given and no global fetch available to load external resources",
    );
  }
  return fetchLoader;
}

/**
 * Whether a value is a fetch `Response` (or looks like one).
 *
 * @param {unknown} value - Candidate
 * @returns {boolean} True for response-like objects
 */
function isResponse(value) {
  return typeof value?.arrayBuffer === "function" && "ok" in value;
}

/**
 * Turn what a loader returned into a document.
 *
 * @param {unknown} loaded - Loader result
 * @param {string} uri - The URI, for error messages
 * @param {object|null} parser - DOMParser to parse text with
 * @returns {Promise<Document|null>} The document, or null for a null result
 * @throws {Error} For failed responses, malformed markup or unsupported values
 */
async function toDocument(loaded, uri, parser) {
  if (loaded === null || loaded === undefined) return null;
  if (typeof loaded.nodeType === "number") return loaded;
  let value = loaded;
  if (isResponse(value)) {
    if (!value.ok) {
      throw new Error(`Failed to load "${uri}": HTTP ${value.status}`);
    }
    value = await value.arrayBuffer();
  }
  if (value instanceof ArrayBuffer) value = new Uint8Array(value);
  if (value instanceof Uint8Array) value = decodeXml(value, uri);
  if (typeof value !== "string") {
    throw new TypeError(
      `The loader returned an unsupported value for "${uri}"`,
    );
  }
  return parseXml(value, parser);
}

/**
 * Create a function loading documents with an asynchronous loader, each URI
 * once (concurrent requests for the same URI share one load).
 *
 * @param {AsyncLoader} loader - The loader
 * @param {object} options - Loading options
 * @param {AbortSignal} [options.signal] - Passed to the loader; aborting
 *   rejects pending loads
 * @param {object|null} [options.domParser] - Parser for loaded text
 * @param {Document|null} [options.referenceDoc] - Document whose window may
 *   provide a DOMParser
 * @returns {(uri: string, baseUri?: string) => Promise<Document|null>} The
 *   de-duplicating load function
 *
 * @example
 * const load = createDocumentFetcher(resolveAsyncLoader(), { signal });
 * const doc = await load("https://example.com/common.xsl");
 */
export function createDocumentFetcher(loader, options = {}) {
  const { signal, domParser = null, referenceDoc = null } = options;
  const parser = resolveDomParser(domParser, referenceDoc);
  const pending = new Map();
  return (uri, baseUri) => {
    if (!pending.has(uri)) {
      const work = abortable(
        Promise.resolve().then(() => loader(uri, baseUri, { signal })),
        signal,
      ).then((loaded) => toDocument(loaded, uri, parser));
      pending.set(uri, work);
    }
    return pending.get(uri);
  };
}
