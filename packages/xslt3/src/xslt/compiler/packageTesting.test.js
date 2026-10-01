// Helpers of the package tests: a library of package texts found by
// name through the resolvePackage option. (A .test.js file, so it is
// neither published nor counted in coverage.)

import { errorCode, parse, run, XSL } from "../testing.test.js";

/** Namespaces declared on the packages of the tests. */
const NAMESPACES = `xmlns:xsl="${XSL}" xmlns:p="urn:p" xmlns:xs="http://www.w3.org/2001/XMLSchema" exclude-result-prefixes="p xs"`;

/**
 * A package.
 * @param {string} body - Its declarations
 * @param {string} [attributes] - More attributes (name, package-version...)
 * @returns {string}
 */
export const pkg = (body, attributes = "") =>
  `<xsl:package version="3.0" ${NAMESPACES} ${attributes}>${body}</xsl:package>`;

/**
 * A library package named urn:p (version 1.0).
 * @param {string} body
 * @param {string} [attributes]
 * @returns {string}
 */
export const libraryP = (body, attributes = "") =>
  pkg(body, `name="urn:p" package-version="1.0" ${attributes}`);

/**
 * xsl:use-package of urn:p.
 * @param {string} [content] - xsl:accept and xsl:override children
 * @param {string} [range] - package-version
 * @returns {string}
 */
export const useP = (content = "", range = "1.0") =>
  `<xsl:use-package name="urn:p" package-version="${range}">${content}</xsl:use-package>`;

/**
 * The resolvePackage option over a library of package texts by name.
 * @param {Record<string, string|object>} library
 * @returns {(name: string) => *}
 */
export const resolver = (library) => (name) => library[name];

/**
 * Runs the initial template `main` of a top-level package.
 * @param {string} top - The top-level package (or stylesheet)
 * @param {Record<string, string|object>} library - Packages by name
 * @param {object} [options] - More options of run
 * @returns {string} the serialized result
 */
export const runTop = (top, library, options = {}) =>
  run(top, null, {
    resolvePackage: resolver(library),
    initialTemplate: "main",
    ...options,
  });

/**
 * The error code of running a top-level package.
 * @param {string} top
 * @param {Record<string, string|object>} library
 * @param {object} [options]
 * @returns {string}
 */
export const topError = (top, library, options) =>
  errorCode(() => runTop(top, library, options));

/** The main template of a top-level package. */
export const main = (body) =>
  `<xsl:template name="main" visibility="public"><out>${body}</out></xsl:template>`;

export { parse };
