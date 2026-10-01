/**
 * The static context of an XPath expression (XPath 3.1 section 2.1.1) built
 * from the options of compileXPath, and the resolution of the names written
 * in an expression to expanded names.
 *
 * @module @tradik/xslt3/xpath/eval/staticContext
 */

import { XPathError } from "../../errors.js";
import { NS } from "../../functions/signatures.js";
import { XS_NAMESPACE } from "../../xdm/types.js";
import { createDecimalFormats } from "./decimalFormats.js";

/** URI of the Unicode codepoint collation, the only one supported. */
export const CODEPOINT_COLLATION =
  "http://www.w3.org/2005/xpath-functions/collation/codepoint";

/** Namespace of the error codes. */
export const ERR_NAMESPACE = "http://www.w3.org/2005/xqt-errors";

/** Namespaces predeclared in every static context. */
export const PREDECLARED_NAMESPACES = Object.freeze({
  xml: "http://www.w3.org/XML/1998/namespace",
  xs: XS_NAMESPACE,
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
  fn: NS.fn,
  math: NS.math,
  map: NS.map,
  array: NS.array,
  err: ERR_NAMESPACE,
});

/**
 * @typedef {object} StaticContext
 * @property {Map<string, string>} namespaces - Prefix to URI
 * @property {string} defaultElementNamespace - "" for none
 * @property {string} defaultFunctionNamespace
 * @property {object} functions - Function library (functions/registry.js)
 * @property {string|undefined} baseUri - Static base URI
 * @property {string} defaultCollation - Collation URI
 * @property {boolean} backwardsCompatible - XPath 1.0 compatibility mode
 * @property {{get: (name: string) => object|undefined}} decimalFormats -
 *   Decimal formats by name (see decimalFormats.js)
 */

/**
 * Normalizes namespace bindings given as an object, a Map or an array of
 * `{prefix, uri}`.
 * @param {object|Map|Array|undefined} namespaces
 * @returns {Array<[string, string]>}
 */
function namespacePairs(namespaces) {
  if (!namespaces) return [];
  if (Array.isArray(namespaces)) {
    return namespaces.map(({ prefix, uri }) => [prefix ?? "", uri]);
  }
  if (namespaces instanceof Map) return [...namespaces];
  return Object.entries(namespaces);
}

/**
 * Builds a static context.
 * @param {object} options - See compileXPath in xpath/index.js
 * @param {object} functions - Function library
 * @returns {StaticContext}
 * @throws {XPathError} FOCH0002 for a default collation other than the
 *   codepoint collation
 */
export function createStaticContext(options, functions) {
  const namespaces = new Map(Object.entries(PREDECLARED_NAMESPACES));
  let defaultElementNamespace = options.defaultElementNamespace ?? "";
  for (const [prefix, uri] of namespacePairs(options.namespaces)) {
    if (prefix === "") defaultElementNamespace = uri;
    else namespaces.set(prefix, uri);
  }
  const defaultCollation = options.defaultCollation ?? CODEPOINT_COLLATION;
  if (defaultCollation !== CODEPOINT_COLLATION) {
    throw new XPathError(
      "FOCH0002",
      `Unsupported collation ${defaultCollation}`,
    );
  }
  const sc = {
    namespaces,
    defaultElementNamespace,
    defaultFunctionNamespace: options.defaultFunctionNamespace ?? NS.fn,
    functions,
    baseUri: options.baseUri,
    defaultCollation,
    backwardsCompatible: Boolean(options.backwardsCompatible),
  };
  sc.decimalFormats = createDecimalFormats(options.decimalFormats, (name) =>
    variableKey(name, sc),
  );
  return sc;
}

/**
 * Resolves a name as written to its namespace URI.
 * @param {import("../syntax/ast.js").QName} name
 * @param {StaticContext} sc
 * @param {string} defaultNamespace - URI for an unprefixed name
 * @returns {string} the namespace URI ("" for none)
 * @throws {XPathError} XPST0081 for an undeclared prefix
 */
export function namespaceOf(name, sc, defaultNamespace) {
  if (name.uri !== null) return name.uri;
  if (name.prefix === null) return defaultNamespace;
  const uri = sc.namespaces.get(name.prefix);
  if (uri === undefined) {
    throw new XPathError(
      "XPST0081",
      `The prefix ${name.prefix} is not declared`,
    );
  }
  return uri;
}

/**
 * Expanded name in Clark notation, `{uri}local`.
 * @param {string} uri
 * @param {string} local
 * @returns {string}
 */
export const clark = (uri, local) => `{${uri}}${local}`;

/**
 * Parses a variable name given in the options: `Q{uri}local`,
 * `prefix:local` (resolved with the static namespaces) or `local`.
 * @param {string} text
 * @param {StaticContext} sc
 * @returns {string} Clark name
 * @throws {XPathError} XPST0081 for an undeclared prefix
 */
export function variableKey(text, sc) {
  const eqName = /^Q\{([^}]*)\}(.+)$/.exec(text);
  if (eqName) return clark(eqName[1], eqName[2]);
  const colon = text.indexOf(":");
  if (colon < 0) return clark("", text);
  const name = { prefix: text.slice(0, colon), local: text.slice(colon + 1) };
  return clark(namespaceOf({ ...name, uri: null }, sc, ""), name.local);
}
