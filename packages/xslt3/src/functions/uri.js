/**
 * Functions on URIs (F&O 3.1 sections 5.4.10 to 5.4.12 and 8.1):
 * encode-for-uri, iri-to-uri, escape-html-uri and resolve-uri, which
 * implements the reference resolution of RFC 3986 section 5.2.
 *
 * @module @tradik/xslt3/functions/uri
 */

import { XPathError } from "../errors.js";
import { AtomicValue } from "../xdm/atomic.js";
import { types } from "../xdm/types.js";
import { define, stringArg, stringItem } from "./support.js";

const encoder = new globalThis.TextEncoder();

/**
 * Percent-encodes (UTF-8, upper-case hex) the codepoints that `keep`
 * rejects.
 * @param {string} text
 * @param {(cp: number) => boolean} keep
 * @returns {string}
 */
export function percentEncode(text, keep) {
  let result = "";
  for (const char of text) {
    if (keep(char.codePointAt(0))) {
      result += char;
      continue;
    }
    for (const byte of encoder.encode(char)) {
      result += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return result;
}

const unreserved = /^[A-Za-z0-9\-_.~]$/;
const notInUri = new Set([...'<>"{}|\\^`'].map((c) => c.codePointAt(0)));

/** @type {Record<string, (cp: number) => boolean>} kept codepoints */
const escapers = {
  "encode-for-uri": (cp) => unreserved.test(String.fromCodePoint(cp)),
  "iri-to-uri": (cp) => cp > 0x20 && cp < 0x7f && !notInUri.has(cp),
  "escape-html-uri": (cp) => cp >= 0x20 && cp <= 0x7e,
};

const referencePattern =
  /^(?:([^:/?#]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/s;
const schemePattern = /^[A-Za-z][A-Za-z0-9+.-]*$/;

/**
 * Splits a URI reference into its RFC 3986 components.
 * @param {string} uri
 * @returns {{scheme?: string, authority?: string, path: string,
 *   query?: string, fragment?: string}}
 * @throws {XPathError} FORG0002 for an invalid scheme or percent-encoding
 */
function parseReference(uri) {
  const [, scheme, authority, path, query, fragment] =
    referencePattern.exec(uri);
  if (
    (scheme !== undefined && !schemePattern.test(scheme)) ||
    /%(?![0-9A-Fa-f]{2})/.test(uri)
  ) {
    throw new XPathError("FORG0002", `Invalid URI ${uri}`);
  }
  return { scheme, authority, path, query, fragment };
}

/**
 * remove_dot_segments of RFC 3986 section 5.2.4.
 * @param {string} path
 * @returns {string}
 */
export function removeDotSegments(path) {
  const output = [];
  const segments = path.split("/");
  segments.forEach((segment, i) => {
    const last = i === segments.length - 1;
    if (segment === ".") {
      if (last) output.push("");
    } else if (segment === "..") {
      if (output.length > 1 || (output.length === 1 && output[0] !== "")) {
        output.pop();
      }
      if (last) output.push("");
    } else {
      output.push(segment);
    }
  });
  return output.join("/");
}

/**
 * Resolves a URI reference against an absolute base (RFC 3986 5.2.2).
 * @param {string} relative
 * @param {string} base
 * @returns {string}
 * @throws {XPathError} FORG0002 for invalid URIs, a relative base or a base
 *   with a fragment
 */
export function resolveUri(relative, base) {
  const r = parseReference(relative);
  if (r.scheme !== undefined) return relative;
  const b = parseReference(base);
  if (b.scheme === undefined || b.fragment !== undefined) {
    throw new XPathError("FORG0002", `Invalid base URI ${base}`);
  }
  let { authority, path, query } = r;
  if (authority === undefined) {
    authority = b.authority;
    if (path === "") {
      path = b.path;
      query ??= b.query;
    } else if (!path.startsWith("/")) {
      path =
        b.authority !== undefined && b.path === ""
          ? `/${path}`
          : b.path.slice(0, b.path.lastIndexOf("/") + 1) + path;
    }
  }
  return (
    `${b.scheme}:` +
    (authority === undefined ? "" : `//${authority}`) +
    removeDotSegments(path) +
    (query === undefined ? "" : `?${query}`) +
    (r.fragment === undefined ? "" : `#${r.fragment}`)
  );
}

/**
 * fn:resolve-uri.
 * @param {Array<*>[]} args - [$relative, $base?]
 * @param {{staticBaseUri?: string}} context
 * @returns {Array<*>}
 */
function resolveUriFunction([relative, base], context) {
  if (relative.length === 0) return [];
  const baseUri = base ? base[0].value : context.staticBaseUri;
  if (baseUri === undefined || baseUri === null) {
    throw new XPathError("FONS0005", "The static base URI is absent");
  }
  return [
    new AtomicValue(types.anyURI, resolveUri(relative[0].value, baseUri)),
  ];
}

/** @type {import("./support.js").FunctionDefinition[]} */
export const uriFunctions = [
  ...Object.entries(escapers).map(([local, keep]) =>
    define(local, ["xs:string?"], "xs:string", ([s]) => [
      stringItem(percentEncode(stringArg(s), keep)),
    ]),
  ),
  define("resolve-uri", ["xs:string?"], "xs:anyURI?", resolveUriFunction),
  define(
    "resolve-uri",
    ["xs:string?", "xs:string"],
    "xs:anyURI?",
    resolveUriFunction,
  ),
];
