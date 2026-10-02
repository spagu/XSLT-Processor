/**
 * Namespace knowledge for stylesheet analysis: the XSLT, EXSLT and MSXML
 * namespaces, which EXSLT modules @tradik/xslt-processor runs (see
 * docs/CONFORMANCE.md), and the prefixed names a stylesheet declares or
 * calls.
 *
 * Namespace names are identifiers compared as strings; nothing is fetched.
 *
 * @module xslt-migrate-check/analysis/namespaces
 */

import { readAttribute } from "../detectors.js";

/** The XSLT namespace. */
export const XSLT_NAMESPACE = "http://www.w3.org/1999/XSL/Transform"; // NOSONAR

/** The MSXML extension namespace (`msxsl:`). */
export const MSXML_NAMESPACE = "urn:schemas-microsoft-com:xslt";

const EXSLT_BASE = "http://exslt.org/"; // NOSONAR
const W3C_BASE = "http://www.w3.org/"; // NOSONAR

/**
 * EXSLT modules by the last segment of their namespace, with what the
 * library does with them: "supported", "opt-in" (dyn:evaluate, off by
 * default) or "unsupported".
 */
export const EXSLT_MODULES = Object.freeze({
  common: "supported",
  math: "supported",
  sets: "supported",
  strings: "supported",
  "dates-and-times": "supported",
  dynamic: "opt-in",
  functions: "unsupported",
  "regular-expressions": "unsupported",
  random: "unsupported",
});

/** EXSLT functions and elements libexslt (and so the library) lacks. */
export const UNSUPPORTED_EXSLT_NAMES = Object.freeze({
  "dates-and-times": ["format-date", "parse-date"],
  dynamic: ["map"],
  common: ["document"],
});

/**
 * Tell whether a name of an EXSLT module is one the library lacks.
 *
 * @param {string} module - EXSLT module
 * @param {string} name - Local name of the function or element
 * @returns {boolean} True for format-date, parse-date, dyn:map, exsl:document
 */
export function isUnsupportedExsltName(module, name) {
  return (
    Object.hasOwn(UNSUPPORTED_EXSLT_NAMES, module) &&
    UNSUPPORTED_EXSLT_NAMES[module].includes(name)
  );
}

/**
 * How the library handles an EXSLT module.
 *
 * @param {string} module - Module name
 * @returns {"supported"|"opt-in"|"unsupported"} Support level
 */
export function exsltSupport(module) {
  return Object.hasOwn(EXSLT_MODULES, module)
    ? EXSLT_MODULES[module]
    : "unsupported";
}

const NAMESPACE_PATTERN = /\bxmlns:([\w.-]+)\s*=\s*["']([^"']*)["']/g;
const ATTRIBUTE_VALUE_PATTERN = /\s[\w:.-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const FUNCTION_CALL_PATTERN =
  /(?<![\w.:-])([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)\s*\(/g;
const ELEMENT_PATTERN = /<([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)/g;
const DEFINED_FUNCTION_PATTERN = /<[\w.-]+:function\b([^>]*)>/g;
const IMPLEMENTS_PREFIX_PATTERN = /\bimplements-prefix\s*=\s*["']([^"']*)["']/g;
const EXTENSION_PREFIXES_PATTERN =
  /\bextension-element-prefixes\s*=\s*["']([^"']*)["']/g;

/**
 * The EXSLT module of a namespace.
 *
 * @param {string} namespace - A namespace name
 * @returns {string|null} The module (last path segment), or null when the
 *   namespace is not EXSLT
 */
export function exsltModule(namespace) {
  if (!namespace.startsWith(EXSLT_BASE)) return null;
  return namespace.slice(EXSLT_BASE.length).replace(/\/$/, "");
}

/**
 * Tell whether a namespace belongs to a W3C standard (XSLT, XPath
 * functions, XML Schema types, maps and arrays) rather than an extension.
 *
 * @param {string} namespace - A namespace name
 * @returns {boolean} True for http://www.w3.org/ namespaces
 */
export function isStandardNamespace(namespace) {
  return namespace.startsWith(W3C_BASE);
}

/**
 * Collect every `xmlns:prefix="..."` declaration. A prefix declared twice
 * keeps its first namespace.
 *
 * @param {string} content - Stylesheet text
 * @returns {Map<string, string>} Prefix to namespace
 */
export function readNamespaces(content) {
  const namespaces = new Map();
  for (const [, prefix, namespace] of content.matchAll(NAMESPACE_PATTERN)) {
    if (!namespaces.has(prefix)) namespaces.set(prefix, namespace);
  }
  return namespaces;
}

/**
 * List the prefixed function calls (`prefix:name(`) in attribute values,
 * where XPath lives. Each call appears once.
 *
 * @param {string} content - Stylesheet text
 * @returns {Array<{prefix: string, name: string}>} The calls
 */
export function readFunctionCalls(content) {
  const seen = new Map();
  for (const value of content.matchAll(ATTRIBUTE_VALUE_PATTERN)) {
    const xpath = value[1] ?? value[2];
    for (const [, prefix, name] of xpath.matchAll(FUNCTION_CALL_PATTERN)) {
      seen.set(`${prefix}:${name}`, { prefix, name });
    }
  }
  return [...seen.values()];
}

/**
 * List the prefixed element names, each once.
 *
 * @param {string} content - Stylesheet text
 * @returns {Array<{prefix: string, name: string}>} The elements
 */
export function readElements(content) {
  const seen = new Map();
  for (const [, prefix, name] of content.matchAll(ELEMENT_PATTERN)) {
    seen.set(`${prefix}:${name}`, { prefix, name });
  }
  return [...seen.values()];
}

/**
 * The names of the functions the stylesheet defines itself (`xsl:function`
 * in 2.0/3.0, `func:function` in EXSLT), which are not extensions.
 *
 * @param {string} content - Stylesheet text
 * @returns {Set<string>} Prefixed names such as "my:total"
 */
export function readDefinedFunctions(content) {
  const names = [...content.matchAll(DEFINED_FUNCTION_PATTERN)].map((match) =>
    readAttribute(match[1], "name"),
  );
  return new Set(names.filter(Boolean));
}

/**
 * The prefixes listed in any `extension-element-prefixes` attribute.
 *
 * @param {string} content - Stylesheet text
 * @returns {string[]} The prefixes, each once
 */
export function readExtensionPrefixes(content) {
  const prefixes = new Set();
  for (const [, list] of content.matchAll(EXTENSION_PREFIXES_PATTERN)) {
    for (const prefix of list.split(/\s+/)) {
      if (prefix && prefix !== "#default") prefixes.add(prefix);
    }
  }
  return [...prefixes];
}

/**
 * The prefixes whose functions an msxsl:script block implements; calls in
 * them belong to that script, not to a separate extension.
 *
 * @param {string} content - Stylesheet text
 * @returns {Set<string>} The prefixes
 */
export function readScriptPrefixes(content) {
  return new Set(
    [...content.matchAll(IMPLEMENTS_PREFIX_PATTERN)].map((match) =>
      match[1].trim(),
    ),
  );
}
