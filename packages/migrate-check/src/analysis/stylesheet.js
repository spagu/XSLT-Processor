/**
 * Stylesheet analysis: the declared XSLT version and the features that
 * matter when a JavaScript processor replaces the browser's: document(),
 * xsl:key, disable-output-escaping, EXSLT modules, MSXML and other
 * extensions, and the xsl:include / xsl:import references.
 *
 * @module xslt-migrate-check/analysis/stylesheet
 */

import {
  STYLESHEET_ROOT_PATTERN,
  lineAt,
  readAttribute,
} from "../detectors.js";
import {
  MSXML_NAMESPACE,
  XSLT_NAMESPACE,
  exsltModule,
  isStandardNamespace,
  isUnsupportedExsltName,
  readDefinedFunctions,
  readElements,
  readExtensionPrefixes,
  readFunctionCalls,
  readNamespaces,
  readScriptPrefixes,
} from "./namespaces.js";

const INCLUDE_PATTERN = /<xsl:(include|import)\b([^>]*)>/g;
const DOCUMENT_PATTERN = /\bdocument\s*\(/;
const DOE_PATTERN = /disable-output-escaping\s*=\s*["']yes["']/;

/**
 * @typedef {object} StylesheetFacts
 * @property {string} version - Declared XSLT version, or "unknown"
 * @property {boolean} exslt - Declares an EXSLT namespace
 * @property {boolean} disableOutputEscaping - Uses disable-output-escaping
 * @property {boolean} documentFunction - Calls document()
 * @property {boolean} key - Declares xsl:key
 * @property {boolean} msxml - Uses the MSXML namespace in any way
 * @property {string[]} exsltModules - EXSLT modules declared, sorted
 * @property {string[]} unsupportedExslt - EXSLT names the library lacks,
 *   e.g. "date:format-date"
 * @property {boolean} msxmlScript - Has an msxsl:script element
 * @property {string[]} msxmlFunctions - msxsl: functions other than
 *   node-set (which the library runs)
 * @property {string[]} extensionFunctions - Calls into other namespaces
 * @property {string[]} extensionNamespaces - Namespaces of non-EXSLT,
 *   non-MSXML extension elements
 * @property {Array<{kind: string, href: string, line: number}>} includes -
 *   xsl:include and xsl:import references
 */

/**
 * Sort a list of unique strings.
 *
 * @param {Iterable<string>} values - The values
 * @returns {string[]} Unique values in code point order
 */
function sorted(values) {
  return [...new Set(values)].sort((a, b) => (a > b) - (a < b));
}

/**
 * Classify the prefixed function calls by the namespace they are bound to.
 *
 * @param {string} content - Stylesheet text
 * @param {Map<string, string>} namespaces - Prefix to namespace
 * @returns {{unsupported: string[], msxml: string[], extensions: string[]}}
 *   Calls by kind; calls to the stylesheet's own functions (xsl:function,
 *   func:function, msxsl:script implements-prefix) are left out
 */
function classifyCalls(content, namespaces) {
  const defined = readDefinedFunctions(content);
  const scripted = readScriptPrefixes(content);
  const found = { unsupported: [], msxml: [], extensions: [] };
  for (const { prefix, name } of readFunctionCalls(content)) {
    const namespace = namespaces.get(prefix);
    const qname = `${prefix}:${name}`;
    const own = defined.has(qname) || scripted.has(prefix);
    if (!namespace || isStandardNamespace(namespace) || own) continue;
    const module = exsltModule(namespace);
    if (module) {
      if (isUnsupportedExsltName(module, name)) found.unsupported.push(qname);
    } else if (namespace === MSXML_NAMESPACE) {
      if (name !== "node-set") found.msxml.push(qname);
    } else {
      found.extensions.push(qname);
    }
  }
  return found;
}

/**
 * Classify the extension elements: msxsl:script, unsupported EXSLT
 * elements (exsl:document) and elements of other extension namespaces.
 *
 * @param {string} content - Stylesheet text
 * @param {Map<string, string>} namespaces - Prefix to namespace
 * @returns {{script: boolean, unsupported: string[], namespaces: string[]}}
 *   Elements by kind
 */
function classifyElements(content, namespaces) {
  const elements = readElements(content);
  const script = elements.some(
    ({ prefix, name }) =>
      name === "script" && namespaces.get(prefix) === MSXML_NAMESPACE,
  );
  const unsupported = elements
    .filter(({ prefix, name }) => {
      const module = exsltModule(namespaces.get(prefix) ?? "");
      return module && isUnsupportedExsltName(module, name);
    })
    .map(({ prefix, name }) => `${prefix}:${name}`);
  const extensionNamespaces = readExtensionPrefixes(content)
    .map((prefix) => namespaces.get(prefix) ?? `${prefix}: (undeclared)`)
    .filter(
      (namespace) =>
        !exsltModule(namespace) &&
        namespace !== MSXML_NAMESPACE &&
        namespace !== XSLT_NAMESPACE,
    );
  return { script, unsupported, namespaces: extensionNamespaces };
}

/**
 * List the xsl:include and xsl:import references with their lines.
 *
 * @param {string} content - Stylesheet text
 * @returns {Array<{kind: string, href: string, line: number}>} References
 */
export function readIncludes(content) {
  return [...content.matchAll(INCLUDE_PATTERN)]
    .map((match) => ({
      kind: `xsl:${match[1]}`,
      href: readAttribute(match[2], "href") ?? "",
      line: lineAt(content, match.index),
    }))
    .filter((include) => include.href !== "");
}

/**
 * Describe an XSL stylesheet: its version and the features that matter
 * when a JavaScript processor replaces the browser's.
 *
 * @param {string} content - Stylesheet text
 * @returns {StylesheetFacts} The facts found
 */
export function detectStylesheet(content) {
  const root = STYLESHEET_ROOT_PATTERN.exec(content);
  const version = root ? readAttribute(root[1], "version") : null;
  const namespaces = readNamespaces(content);
  const modules = [...namespaces.values()]
    .map(exsltModule)
    .filter((module) => module !== null);
  const calls = classifyCalls(content, namespaces);
  const elements = classifyElements(content, namespaces);
  return {
    version: version || "unknown",
    exslt: modules.length > 0,
    disableOutputEscaping: DOE_PATTERN.test(content),
    documentFunction: DOCUMENT_PATTERN.test(content),
    key: content.includes("<xsl:key"),
    msxml: content.includes("msxsl:") || content.includes(MSXML_NAMESPACE),
    exsltModules: sorted(modules),
    unsupportedExslt: sorted([...calls.unsupported, ...elements.unsupported]),
    msxmlScript: elements.script,
    msxmlFunctions: sorted(calls.msxml),
    extensionFunctions: sorted(calls.extensions),
    extensionNamespaces: sorted(elements.namespaces),
    includes: readIncludes(content),
  };
}
