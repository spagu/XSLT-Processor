/**
 * Hooks of the dynamic context that reach outside the expression: text
 * resources (fn:unparsed-text, fn:json-doc), XML parsing (fn:parse-xml)
 * and collections (fn:collection, fn:uri-collection). Each is built from
 * a dynamic option, with a default:
 *
 * - `textLoader(uri)`: returns the resource as a string, bytes, or
 *   `{content, encoding, mediaType}`; default: no resources, so an
 *   expression cannot read files unless the host allows it (pass
 *   `readFileUri` to read `file:` URIs in Node.js);
 * - `xmlParser(text, baseUri)`: returns a Document, throws when the text
 *   is not well-formed; default: `globalThis.DOMParser` when present;
 * - `collections(uri)`: returns the items of a collection (JavaScript
 *   values are converted as variables are), `uri` null for the default
 *   collection; default: no collections.
 *
 * @module @tradik/xslt3/xpath/eval/resources
 */

import { XPathError } from "../../errors.js";
import { decodeText } from "../../functions/textDecoding.js";
import { toSequence } from "./values.js";

/**
 * Reads `file:` URIs with node:fs (Node.js 22.3 and later). Not used by
 * default: pass it as the `textLoader` option to let expressions read
 * local files, only when the expressions are trusted.
 * @param {string} uri - Absolute URI
 * @returns {Uint8Array|null} the bytes, null for other schemes or
 *   without node:fs
 */
export function readFileUri(uri) {
  const fs = globalThis.process?.getBuiltinModule?.("node:fs");
  if (!fs || !uri.startsWith("file:")) return null;
  return fs.readFileSync(new globalThis.URL(uri));
}

/**
 * The default text loader: no resource is available.
 * @returns {null}
 */
function noResources() {
  return null;
}

/**
 * The absolute URI of a resource reference.
 * @param {string} href
 * @param {string|undefined} baseUri - Static base URI
 * @returns {string}
 * @throws {XPathError} FOUT1170 for a fragment identifier, an invalid URI
 *   or a relative URI without base
 */
export function resourceUri(href, baseUri) {
  if (href.includes("#") || /%(?![0-9A-Fa-f]{2})/.test(href)) {
    throw new XPathError("FOUT1170", `Invalid resource URI ${href}`);
  }
  try {
    return new globalThis.URL(href, baseUri).href;
  } catch (error) {
    throw new XPathError("FOUT1170", `Cannot resolve the URI ${href}`, {
      cause: error,
    });
  }
}

/**
 * The text loading hook: resolves, loads (once per URI and encoding
 * during an evaluation) and decodes.
 * @param {((uri: string) => import("../../functions/textDecoding.js").TextResource)|undefined} loader
 * @param {string|undefined} baseUri
 * @returns {(href: string, encoding?: string, base?: string) => string}
 *   the hook; `base` replaces the base URI of relative references
 */
export function createTextLoader(loader = noResources, baseUri) {
  const texts = new Map();
  return (href, encoding, base = baseUri) => {
    const uri = resourceUri(href, base);
    const key = `${encoding ?? ""} ${uri}`;
    if (texts.has(key)) return texts.get(key);
    let resource;
    try {
      resource = loader(uri);
    } catch (error) {
      throw new XPathError("FOUT1170", `Cannot read ${uri}`, { cause: error });
    }
    if (resource === null || resource === undefined) {
      throw new XPathError("FOUT1170", `No resource at ${uri}`);
    }
    const text = decodeText(resource, encoding);
    texts.set(key, text);
    return text;
  };
}

/**
 * The XML parsing hook.
 * @param {((text: string, baseUri?: string) => Document)|undefined} parser
 * @returns {(text: string, baseUri?: string) => Document}
 */
export function createXmlParser(parser) {
  if (parser) return parser;
  return (text) => {
    const DOMParser = globalThis.DOMParser;
    if (!DOMParser) {
      throw new XPathError(
        "FODC0006",
        "No XML parser: pass the xmlParser option",
      );
    }
    const document = new DOMParser().parseFromString(text, "application/xml");
    if (document.getElementsByTagName("parsererror").length) {
      throw new XPathError("FODC0006", "The string is not well-formed XML");
    }
    return document;
  };
}

/**
 * The collection hook.
 * @param {((uri: string|null) => Array|null|undefined)|undefined} collections
 * @param {string|undefined} baseUri
 * @returns {(href: string|null, base?: string) => Array} the hook; `base`
 *   replaces the base URI of relative references
 * @throws {XPathError} FODC0002 for an unknown collection, FODC0004 for an
 *   invalid URI
 */
export function createCollections(collections, baseUri) {
  return (href, base = baseUri) => {
    let uri = null;
    if (href !== null) {
      try {
        uri = new globalThis.URL(href, base).href;
      } catch (error) {
        throw new XPathError("FODC0004", `Invalid collection URI ${href}`, {
          cause: error,
        });
      }
    }
    const items = collections?.(uri);
    if (!items) {
      throw new XPathError(
        "FODC0002",
        uri === null ? "No default collection" : `No collection ${uri}`,
      );
    }
    return toSequence(items);
  };
}
