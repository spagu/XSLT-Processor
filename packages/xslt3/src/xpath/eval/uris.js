/**
 * URI resolution against a base URI (RFC 3986, through the WHATWG URL
 * parser of the platform).
 *
 * @module @tradik/xslt3/xpath/eval/uris
 */

/**
 * Resolves a URI against a base URI.
 * @param {string} uri
 * @param {string|undefined} base
 * @returns {string} the absolute URI, or the URI unchanged when it cannot
 *   be resolved
 */
export function resolveUri(uri, base) {
  try {
    return new globalThis.URL(uri, base).href;
  } catch {
    return uri;
  }
}
