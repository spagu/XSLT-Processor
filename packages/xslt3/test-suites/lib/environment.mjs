/**
 * Test environments of both catalogs: the documents, parameters, namespaces,
 * decimal formats, collations and resources a test runs with. Paths are made
 * absolute against the directory of the file that declares them.
 *
 * @module test-suites/lib/environment
 */

import { join } from "node:path";
import {
  attr,
  attributes,
  boolAttr,
  childElements,
  firstChild,
} from "./xmlUtil.mjs";

/**
 * @typedef {object} Source
 * @property {string} role - "." (context item), "$name" (variable) or ""
 * @property {string} [file] - Absolute path of the document
 * @property {string} [content] - Inline document text (xslt30-test)
 * @property {string} [uri] - URI the document is available under
 * @property {string} [validation] - "strict", "lax" or "skip"
 * @property {string} [select] - Expression selecting the context item
 */

/**
 * @typedef {object} StylesheetModule
 * @property {string} [file] - Absolute path
 * @property {string} [role] - "principal" or "secondary"
 * @property {string} [uri] - Package name
 * @property {string} [packageVersion] - Package version
 */

/**
 * @typedef {object} Environment
 * @property {string} [name] - Name of a shared environment
 * @property {string} [ref] - Name of the shared environment referred to
 * @property {Source[]} sources - Documents
 * @property {object[]} params - `{name, select, as, source, declared, static}`
 * @property {{prefix: string, uri: string}[]} namespaces - Static namespaces
 * @property {Record<string, string>[]} decimalFormats - Attribute maps
 * @property {{uri: string, default: boolean}[]} collations - Collations
 * @property {object[]} resources - `{uri, file, mediaType, encoding}`
 * @property {object[]} collections - `{uri, sources, queries}`
 * @property {object[]} schemas - `{uri, file}`
 * @property {StylesheetModule[]} stylesheets - Stylesheets (xslt30-test)
 * @property {StylesheetModule[]} packages - Packages (xslt30-test)
 * @property {string} [staticBaseUri] - Static base URI
 * @property {string} [contextItem] - Expression giving the context item
 */

/**
 * Resolve an optional relative file attribute.
 *
 * @param {Element} element - Element with a `file` attribute
 * @param {string} baseDir - Base directory
 * @returns {string|undefined} Absolute path, if the attribute is present
 */
function fileOf(element, baseDir) {
  const file = attr(element, "file");
  return file === undefined ? undefined : join(baseDir, file);
}

/**
 * Read a `<source>` element.
 *
 * @param {Element} element - The element
 * @param {string} baseDir - Base directory
 * @returns {Source} The source
 */
export function parseSource(element, baseDir) {
  const content = firstChild(element, "content");
  return {
    role: attr(element, "role") ?? "",
    file: fileOf(element, baseDir),
    content: content?.textContent,
    uri: attr(element, "uri"),
    validation: attr(element, "validation"),
    select: attr(element, "select"),
  };
}

/**
 * Read a `<stylesheet>` or `<package>` element (xslt30-test).
 *
 * @param {Element} element - The element
 * @param {string} baseDir - Base directory
 * @returns {StylesheetModule} The module
 */
export function parseModule(element, baseDir) {
  return {
    file: fileOf(element, baseDir),
    role: attr(element, "role"),
    uri: attr(element, "uri"),
    packageVersion: attr(element, "package-version"),
  };
}

/**
 * Read a `<param>` element (environment, test, initial template).
 *
 * @param {Element} element - The element
 * @returns {object} `{name, select, as, source, declared, static, tunnel}`
 */
export function parseParam(element) {
  return {
    name: attr(element, "name"),
    select: attr(element, "select"),
    as: attr(element, "as"),
    source: attr(element, "source"),
    declared: boolAttr(element, "declared"),
    static: boolAttr(element, "static"),
    tunnel: boolAttr(element, "tunnel"),
  };
}

/**
 * Read an `<environment>` element, shared (named), a reference (`ref`) or
 * inline in a test case.
 *
 * @param {Element} element - The element
 * @param {string} baseDir - Directory of the declaring file
 * @returns {Environment} The environment
 */
export function parseEnvironment(element, baseDir) {
  const children = (name) => childElements(element, name);
  const base = firstChild(element, "static-base-uri");
  const contextItem = firstChild(element, "context-item");
  return {
    name: attr(element, "name"),
    ref: attr(element, "ref"),
    sources: children("source").map((el) => parseSource(el, baseDir)),
    params: children("param").map(parseParam),
    namespaces: children("namespace").map((el) => ({
      prefix: attr(el, "prefix") ?? "",
      uri: attr(el, "uri") ?? "",
    })),
    decimalFormats: children("decimal-format").map(attributes),
    collations: children("collation").map((el) => ({
      uri: attr(el, "uri"),
      default: boolAttr(el, "default"),
    })),
    resources: children("resource").map((el) => ({
      uri: attr(el, "uri"),
      file: fileOf(el, baseDir),
      mediaType: attr(el, "media-type"),
      encoding: attr(el, "encoding"),
    })),
    collections: children("collection").map((el) => ({
      uri: attr(el, "uri"),
      sources: childElements(el, "source").map((s) => parseSource(s, baseDir)),
      queries: childElements(el, "query").map((q) => q.textContent),
    })),
    schemas: children("schema").map((el) => ({
      uri: attr(el, "uri"),
      file: fileOf(el, baseDir),
    })),
    stylesheets: children("stylesheet").map((el) => parseModule(el, baseDir)),
    packages: children("package").map((el) => parseModule(el, baseDir)),
    staticBaseUri: base ? attr(base, "uri") : undefined,
    contextItem: contextItem ? attr(contextItem, "select") : undefined,
  };
}

/**
 * Resolve the environment of a test case: an inline one as is, a reference
 * looked up first among the test set's environments, then the catalog's.
 *
 * @param {Environment|undefined} environment - Environment of the test case
 * @param {Map<string, Environment>} local - Test set environments
 * @param {Map<string, Environment>} shared - Catalog environments
 * @returns {Environment|null} The environment, null when there is none
 * @throws {Error} When a reference does not resolve
 */
export function resolveEnvironment(environment, local, shared) {
  if (!environment) return null;
  if (environment.ref === undefined) return environment;
  const found = local.get(environment.ref) ?? shared.get(environment.ref);
  if (!found) throw new Error(`Unknown environment "${environment.ref}"`);
  return found;
}
