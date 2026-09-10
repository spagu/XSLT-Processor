/**
 * URI helpers for XSLT stylesheet and document resolution.
 *
 * Kept deliberately small and dependency free: the engine only needs enough
 * URI arithmetic to turn a relative `href` into something a host supplied
 * loader can resolve, plus fragment removal for the `document()` function.
 */

"use strict";

/** Matches an absolute URI such as `http://`, `https://` or `file://`. */
const ABSOLUTE_URI_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Resolve a possibly relative URI against a base URI.
 *
 * Absolute URIs (with a scheme) and root relative URIs (starting with `/`)
 * are returned untouched, as is any URI when no base is available.
 *
 * @param {string} href - The URI to resolve
 * @param {string} [baseUri] - The base URI, typically the stylesheet location
 * @returns {string} The resolved URI
 *
 * @example
 * resolveUri('common.xsl', '/styles/main.xsl'); // '/styles/common.xsl'
 */
export function resolveUri(href, baseUri) {
  if (!href) return href;
  if (!baseUri || isAbsoluteUri(href) || href.startsWith("/")) {
    return href;
  }

  const lastSlash = baseUri.lastIndexOf("/");
  const baseDir = lastSlash >= 0 ? baseUri.substring(0, lastSlash + 1) : "";

  return baseDir + href;
}

/**
 * Check whether a URI is absolute (has a scheme).
 *
 * @param {string} uri - The URI to inspect
 * @returns {boolean} True when the URI carries a scheme
 *
 * @example
 * isAbsoluteUri('https://example.com/a.xml'); // true
 */
export function isAbsoluteUri(uri) {
  return ABSOLUTE_URI_PATTERN.test(uri);
}

/**
 * Remove a fragment identifier from a URI.
 *
 * XSLT 1.0 leaves the meaning of fragment identifiers passed to `document()`
 * implementation defined; this processor ignores them.
 *
 * @param {string} uri - The URI, possibly carrying a `#fragment`
 * @returns {string} The URI without its fragment
 *
 * @example
 * stripFragment('data.xml#section'); // 'data.xml'
 */
export function stripFragment(uri) {
  if (typeof uri !== "string") return "";
  const hash = uri.indexOf("#");
  return hash === -1 ? uri : uri.substring(0, hash);
}
