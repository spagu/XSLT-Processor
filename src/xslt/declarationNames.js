/**
 * Names of named stylesheet objects (XSLT 1.0 section 2.4).
 *
 * Named templates, attribute sets and decimal formats are named by QNames
 * that are expanded with the namespace declarations in scope on the element
 * carrying the name; the default namespace is not used for unprefixed names.
 * Two names are the same when their expanded names are, whatever prefixes
 * they use, so every table of such objects is keyed by the expanded name in
 * Clark notation (`{uri}local`, or the bare local name in no namespace).
 *
 * @module xslt/declarationNames
 */

"use strict";

import { isQName } from "./qname.js";
import { splitQName } from "./resultNamespaces.js";
import { inScopeNamespaces, resolvePrefix } from "./stylesheetNamespaces.js";
import { expandedNameKey } from "./serializer/settings.js";

/**
 * Expand a QName-valued attribute of a stylesheet element.
 *
 * @param {string} qname - The QName, e.g. `p:format` or `common`
 * @param {Element} element - The element in whose scope the prefix resolves
 * @returns {{key: string}|{error: string}} The expanded name key, or why the
 *   value is not a QName with a declared prefix
 *
 * @example
 * // <xsl:decimal-format xmlns:p="urn:p" name="p:f"/>
 * expandName("p:f", element); // { key: "{urn:p}f" }
 * expandName("q:f", element); // { error: 'undeclared namespace prefix "q" in "q:f"' }
 */
export function expandName(qname, element) {
  if (!isQName(qname)) return { error: `invalid QName "${qname}"` };
  const { prefix, localName } = splitQName(qname);
  if (!prefix) return { key: localName };
  const namespaceUri = resolvePrefix(inScopeNamespaces(element), prefix);
  if (!namespaceUri) {
    return { error: `undeclared namespace prefix "${prefix}" in "${qname}"` };
  }
  return { key: expandedNameKey(namespaceUri, localName) };
}

/**
 * Expand a QName that must be valid, failing with a message naming where it
 * comes from.
 *
 * @param {string} qname - The QName
 * @param {Element} element - The element in whose scope the prefix resolves
 * @param {string} where - The attribute holding it, e.g. "xsl:template name"
 * @returns {string} The expanded name key
 * @throws {Error} When the value is not a QName or its prefix is undeclared
 *
 * @example
 * requireExpandedName("p:t", templateElement, "xsl:template name"); // "{urn:p}t"
 */
export function requireExpandedName(qname, element, where) {
  const expanded = expandName(qname, element);
  if (expanded.error) throw new Error(`${where}: ${expanded.error}`);
  return expanded.key;
}

/**
 * Expand the whitespace separated QNames of an attribute such as
 * `use-attribute-sets`.
 *
 * @param {string|null} value - The attribute value
 * @param {Element} element - The element carrying the attribute
 * @param {string} where - Attribute description for error messages
 * @returns {string[]} The expanded name keys, in order
 * @throws {Error} When one of the names is not a QName with a declared prefix
 */
export function requireExpandedNames(value, element, where) {
  if (!value) return [];
  return value
    .split(/[ \t\r\n]+/)
    .filter(Boolean)
    .map((qname) => requireExpandedName(qname, element, where));
}
