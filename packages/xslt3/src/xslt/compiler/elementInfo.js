/**
 * What a stylesheet element inherits from its ancestors: in-scope
 * namespaces, the effective version, the standard attributes
 * xpath-default-namespace, default-collation, exclude-result-prefixes,
 * extension-element-prefixes and expand-text, and the base URI (xml:base).
 * Computed once per element and cached.
 *
 * @module @tradik/xslt3/xslt/compiler/elementInfo
 */

import { getCollation } from "../../functions/collations.js";
import { resolveUri } from "../../xpath/eval/uris.js";
import {
  clarkOf,
  RESERVED_NAMESPACES,
  resolveQName,
  standardAttr,
  tokens,
  XML_NS,
  XMLNS_NS,
  XSL_NS,
  xsltError,
} from "../names.js";

/**
 * @typedef {object} ElementInfo
 * @property {Map<string, string>} namespaces - Prefix to URI ("" default)
 * @property {number} version - Effective version
 * @property {string} xpathDefaultNs - Default element namespace of XPath
 * @property {string|undefined} defaultCollation - Collation URI
 * @property {string|undefined} baseUri
 * @property {Set<string>} excluded - Excluded result namespace URIs
 * @property {Set<string>} extension - Extension namespace URIs
 * @property {boolean} expandText - Text value templates enabled
 * @property {string} defaultMode - Clark name, "" for the unnamed mode
 */

/** @type {WeakMap<Element, ElementInfo>} */
const cache = new WeakMap();
/** @type {WeakMap<Element, string>} base URIs of module roots */
const moduleUris = new WeakMap();

/**
 * Records the URI of a stylesheet module, the base URI of its root.
 * @param {Element} root
 * @param {string|undefined} uri
 */
export function setModuleUri(root, uri) {
  if (uri !== undefined) moduleUris.set(root, uri);
}

const ROOT_INFO = Object.freeze({
  namespaces: new Map([["xml", XML_NS]]),
  version: 3,
  xpathDefaultNs: "",
  defaultCollation: undefined,
  baseUri: undefined,
  excluded: new Set([XSL_NS]),
  extension: new Set(),
  expandText: false,
  defaultMode: "",
});

/**
 * @param {Element} element
 * @param {Map<string, string>} inherited
 * @returns {Map<string, string>} the in-scope namespaces of the element
 */
function namespacesOf(element, inherited) {
  let namespaces = inherited;
  for (const attribute of element.attributes) {
    const name = attribute.name;
    const declaration =
      attribute.namespaceURI === XMLNS_NS ||
      name === "xmlns" ||
      name.startsWith("xmlns:");
    if (!declaration) continue;
    if (namespaces === inherited) namespaces = new Map(inherited);
    namespaces.set(name === "xmlns" ? "" : name.slice(6), attribute.value);
  }
  if (element.namespaceURI && !namespaces.has(element.prefix ?? "")) {
    if (namespaces === inherited) namespaces = new Map(inherited);
    namespaces.set(element.prefix ?? "", element.namespaceURI);
  }
  return namespaces;
}

/**
 * URIs of a list of prefixes (exclude-result-prefixes and friends).
 * @param {string} text
 * @param {Map<string, string>} namespaces
 * @param {Set<string>} into - Receives the URIs
 * @param {string} code - Error code for an undeclared prefix
 */
function addPrefixUris(text, namespaces, into, code) {
  for (const token of tokens(text)) {
    if (token === "#all") {
      for (const uri of namespaces.values()) into.add(uri);
      continue;
    }
    const prefix = token === "#default" ? "" : token;
    const uri = namespaces.get(prefix);
    if (uri === undefined || (uri === "" && prefix !== "")) {
      throw xsltError(
        prefix === "" ? "XTSE0809" : code,
        `No namespace is bound to the prefix "${token}"`,
      );
    }
    into.add(uri);
  }
}

/**
 * The first collation of a default-collation list that is supported.
 * @param {string} text
 * @param {string|undefined} base
 * @returns {string}
 */
function chooseCollation(text, base) {
  for (const token of tokens(text)) {
    const uri = resolveUri(token, base);
    try {
      getCollation(uri);
      return uri;
    } catch {
      // try the next one
    }
  }
  throw xsltError("XTSE0125", `No supported collation in "${text}"`);
}

/**
 * The parsed version attribute.
 * @param {string} text
 * @returns {number}
 */
function parseVersion(text) {
  if (!/^\s*\+?(\d+(\.\d*)?|\.\d+)\s*$/.test(text)) {
    throw xsltError("XTSE0110", `Invalid version "${text}"`);
  }
  return Number(text);
}

/**
 * Computes the info of an element from the info of its parent.
 * @param {Element} element
 * @param {ElementInfo} parent
 * @returns {ElementInfo}
 */
function computeInfo(element, parent) {
  const info = { ...parent };
  info.namespaces = namespacesOf(element, parent.namespaces);
  const own = (name) => standardAttr(element, name);
  const xmlBase = element.getAttributeNS(XML_NS, "base");
  const moduleUri = moduleUris.get(element);
  if (moduleUri !== undefined) info.baseUri = moduleUri;
  if (xmlBase) info.baseUri = resolveUri(xmlBase, info.baseUri);
  const version = own("version");
  if (version !== undefined) info.version = parseVersion(version);
  const xpathNs = own("xpath-default-namespace");
  if (xpathNs !== undefined) info.xpathDefaultNs = xpathNs.trim();
  const collation = own("default-collation");
  if (collation !== undefined) {
    info.defaultCollation = chooseCollation(collation, info.baseUri);
  }
  const excluded = own("exclude-result-prefixes");
  const extension = own("extension-element-prefixes");
  if (excluded !== undefined || extension !== undefined) {
    info.excluded = new Set(parent.excluded);
    addPrefixUris(excluded, info.namespaces, info.excluded, "XTSE0808");
  }
  if (extension !== undefined) {
    info.extension = new Set(parent.extension);
    addPrefixUris(extension, info.namespaces, info.extension, "XTSE1430");
    for (const uri of info.extension) {
      if (RESERVED_NAMESPACES.has(uri)) {
        throw xsltError("XTSE0085", `${uri} cannot be an extension namespace`);
      }
    }
    for (const uri of info.extension) info.excluded.add(uri);
  }
  const defaultMode = own("default-mode");
  if (defaultMode !== undefined) {
    const text = defaultMode.trim();
    info.defaultMode =
      text === "#unnamed"
        ? ""
        : clarkOf(resolveQName(text, info.namespaces, { code: "XTSE0545" }));
  }
  const expand = own("expand-text");
  if (expand !== undefined) {
    const value = expand.trim();
    if (!["yes", "true", "1", "no", "false", "0"].includes(value)) {
      throw xsltError("XTSE0020", `Invalid expand-text "${expand}"`);
    }
    info.expandText = ["yes", "true", "1"].includes(value);
  }
  return info;
}

/**
 * The info of a stylesheet element.
 * @param {Element} element
 * @returns {ElementInfo}
 */
export function infoOf(element) {
  let info = cache.get(element);
  if (info) return info;
  const chain = [];
  let current = element;
  while (current && current.nodeType === 1 && !cache.has(current)) {
    chain.push(current);
    if (moduleUris.has(current)) break;
    current = current.parentNode;
  }
  info =
    current && current.nodeType === 1 && cache.has(current)
      ? cache.get(current)
      : ROOT_INFO;
  for (let i = chain.length - 1; i >= 0; i--) {
    info = computeInfo(chain[i], info);
    cache.set(chain[i], info);
  }
  return info;
}
