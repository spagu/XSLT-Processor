/**
 * In-scope namespaces of stylesheet elements.
 *
 * Prefixes in XPath expressions, patterns and QName-valued attributes resolve
 * against the namespace declarations in scope on the element that carries
 * them (XSLT 1.0 section 2.4), not against one stylesheet-wide table: a
 * declaration on `xsl:template` or on a literal result element applies inside
 * it only, and an included stylesheet may bind a prefix differently from the
 * including one. The same bindings are the namespace nodes that literal
 * result elements copy to the result tree (section 7.1.1), minus the XSLT
 * namespace and the excluded and extension prefixes.
 *
 * Every map is computed once per element and cached; an element without
 * declarations of its own shares its parent's (frozen) map, so identical
 * scopes can be recognised by identity.
 *
 * @module xslt/stylesheetNamespaces
 */

"use strict";

import { XSLT_NAMESPACE } from "./elements.js";

/** Namespace of `xmlns` attributes. */
export const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

/** Namespace bound to the `xml` prefix. */
export const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

/** The scope above the stylesheet document element. */
const EMPTY_SCOPE = Object.freeze({});

/** Namespaces excluded above the stylesheet document element. */
const BASE_EXCLUSIONS = new Set([XSLT_NAMESPACE]);

/** No extension namespaces, above the stylesheet document element. */
const NO_EXTENSIONS = new Set();

const scopes = new WeakMap();
const exclusions = new WeakMap();
const extensions = new WeakMap();
const namespaceNodes = new WeakMap();

/**
 * The prefix a namespace declaration attribute declares, or null when the
 * attribute is not a declaration.
 *
 * @param {Attr} attribute - Any attribute
 * @returns {string|null} The prefix, "" for a default namespace declaration
 */
export function declaredPrefix(attribute) {
  const name = attribute.name;
  if (name === "xmlns") return "";
  if (name.startsWith("xmlns:")) return name.slice(6);
  return null;
}

/**
 * The namespace bindings in scope on a stylesheet element.
 *
 * @param {Node|null} node - A stylesheet element (other nodes have no scope)
 * @returns {Readonly<Object<string, string>>} URIs by prefix; "" holds the
 *   default namespace, an empty URI means "undeclared"
 *
 * @example
 * inScopeNamespaces(templateElement).f; // "urn:f"
 */
export function inScopeNamespaces(node) {
  if (node?.nodeType !== 1) return EMPTY_SCOPE;

  let scope = scopes.get(node);
  if (scope) return scope;

  const parentScope = inScopeNamespaces(node.parentNode);
  let own = null;
  for (const attribute of node.attributes) {
    const prefix = declaredPrefix(attribute);
    if (prefix === null) continue;
    own ??= {};
    own[prefix] = attribute.value;
  }

  scope = own ? Object.freeze({ ...parentScope, ...own }) : parentScope;
  scopes.set(node, scope);
  return scope;
}

/**
 * Split an XSLT attribute holding whitespace separated prefixes.
 *
 * @param {string|null} value - e.g. `"a b #default"`
 * @returns {string[]} The prefixes, "" standing for `#default`
 */
function prefixList(value) {
  if (!value) return [];
  return value
    .split(/[ \t\r\n]+/)
    .filter(Boolean)
    .map((prefix) => (prefix === "#default" ? "" : prefix));
}

/** Attributes whose prefixes are excluded from the result tree. */
const EXCLUSION_ATTRIBUTES = [
  "exclude-result-prefixes",
  "extension-element-prefixes",
];

/** Attributes declaring extension namespaces (XSLT 1.0 section 14.1). */
const EXTENSION_ATTRIBUTES = ["extension-element-prefixes"];

/**
 * Read prefix list attributes of one stylesheet element: unqualified on
 * `xsl:stylesheet`, `xsl:`-qualified on literal result elements.
 *
 * @param {Element} element - A stylesheet element
 * @param {string[]} attributes - Local names of the attributes to read
 * @returns {Array<{prefix: string, attribute: string}>} Prefixes declared on
 *   this element, with the attribute declaring each
 */
function ownPrefixes(element, attributes) {
  const isXslt = element.namespaceURI === XSLT_NAMESPACE;
  const read = (localName) =>
    isXslt
      ? element.getAttribute(localName)
      : element.getAttributeNS(XSLT_NAMESPACE, localName);
  return attributes.flatMap((attribute) =>
    prefixList(read(attribute)).map((prefix) => ({ prefix, attribute })),
  );
}

/**
 * Namespace URIs named by prefix list attributes on a stylesheet element or
 * its ancestors, cached per element.
 *
 * @param {Node|null} node - A stylesheet element
 * @param {object} kind - What to collect
 * @param {string[]} kind.attributes - The prefix list attributes
 * @param {WeakMap<Element, Set<string>>} kind.cache - Results by element
 * @param {Set<string>} kind.base - The set above the document element
 * @param {boolean} kind.report - Whether undeclared prefixes are reported
 * @returns {Set<string>} The namespace URIs
 */
function declaredNamespaces(node, kind) {
  if (node?.nodeType !== 1) return kind.base;

  let found = kind.cache.get(node);
  if (found) return found;

  found = declaredNamespaces(node.parentNode, kind);
  const prefixes = ownPrefixes(node, kind.attributes);
  if (prefixes.length > 0) {
    const scope = inScopeNamespaces(node);
    found = new Set(found);
    for (const { prefix, attribute } of prefixes) {
      const uri = resolvePrefix(scope, prefix);
      if (uri) {
        found.add(uri);
      } else if (kind.report) {
        // An error in XSLT 1.0 (section 7.1.1) that libxslt reports and
        // recovers from; reported once, as the result is cached per element
        console.warn(
          `XSLT: ${attribute}: undefined namespace prefix "${prefix || "#default"}" is ignored`,
        );
      }
    }
  }
  kind.cache.set(node, found);
  return found;
}

/** Excluded namespaces: excluded and extension prefixes, plus XSLT. */
const EXCLUDED = {
  attributes: EXCLUSION_ATTRIBUTES,
  cache: exclusions,
  base: BASE_EXCLUSIONS,
  report: true,
};

/** Extension namespaces (reported through EXCLUDED already). */
const EXTENSIONS = {
  attributes: EXTENSION_ATTRIBUTES,
  cache: extensions,
  base: NO_EXTENSIONS,
  report: false,
};

/**
 * Namespace URIs excluded from the result tree around a stylesheet element:
 * the XSLT namespace, plus the namespaces of every excluded or extension
 * prefix declared on the element or its ancestors. A prefix that is not
 * declared (including `#all`, which XSLT 1.0 does not know) is reported with
 * console.warn and ignored.
 *
 * @param {Node|null} node - A stylesheet element
 * @returns {Set<string>} Excluded namespace URIs
 */
function excludedNamespaces(node) {
  return declaredNamespaces(node, EXCLUDED);
}

/**
 * Whether a stylesheet element is an extension element: an element in a
 * namespace that an `extension-element-prefixes` attribute on it or on an
 * ancestor declares as an extension namespace (XSLT 1.0 section 14.1).
 *
 * @param {Element} element - A stylesheet element that is not in the XSLT namespace
 * @returns {boolean} True for extension elements
 *
 * @example
 * // <xsl:stylesheet xmlns:e="urn:e" extension-element-prefixes="e">
 * isExtensionElement(eElement); // true
 */
export function isExtensionElement(element) {
  const uri = element.namespaceURI;
  if (!uri) return false;
  // Resolving the exclusions first reports undeclared prefixes once
  excludedNamespaces(element);
  return declaredNamespaces(element, EXTENSIONS).has(uri);
}

/**
 * The namespace nodes a literal result element copies to the result tree
 * (XSLT 1.0 section 7.1.1).
 *
 * @param {Element} node - The literal result element
 * The list is shared by every element with the same scope and exclusions,
 * so equal lists can be compared by identity.
 *
 * @param {Element} node - The literal result element
 * @returns {Array<[string, string]>} `[prefix, uri]` pairs, "" for the default namespace
 *
 * @example
 * resultNamespaceNodes(literalElement); // [["q", "urn:q"]]
 */
export function resultNamespaceNodes(node) {
  const scope = inScopeNamespaces(node);
  const excluded = excludedNamespaces(node);

  let byExclusions = namespaceNodes.get(scope);
  if (!byExclusions) {
    byExclusions = new WeakMap();
    namespaceNodes.set(scope, byExclusions);
  }
  let nodes = byExclusions.get(excluded);
  if (!nodes) {
    nodes = Object.entries(scope).filter(
      ([, uri]) => uri !== "" && !excluded.has(uri),
    );
    byExclusions.set(excluded, nodes);
  }
  return nodes;
}

/**
 * Resolve a QName prefix against a scope.
 *
 * @param {Object<string, string>} scope - Bindings from {@link inScopeNamespaces}
 * @param {string} prefix - The prefix, "" for the default namespace
 * @returns {string|null} The namespace URI, or null when unbound
 */
export function resolvePrefix(scope, prefix) {
  if (prefix === "xml") return XML_NAMESPACE;
  return Object.hasOwn(scope, prefix) && scope[prefix] !== ""
    ? scope[prefix]
    : null;
}
