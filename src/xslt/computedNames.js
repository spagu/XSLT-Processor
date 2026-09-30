/**
 * Validation of the names computed by `xsl:element` and `xsl:attribute`
 * (XSLT 1.0 sections 7.1.2 and 7.1.3).
 *
 * The `name` attribute is an attribute value template, so its value is only
 * known at run time. It must be a QName whose prefix (when there is no
 * `namespace` attribute) is declared in scope on the instruction, and an
 * attribute may not be called `xmlns` (nor use the `xmlns` prefix). Like
 * libxslt, the processor recovers from these errors by reporting them and not
 * creating the element (with its content) or the attribute.
 *
 * @module xslt/computedNames
 */

"use strict";

import { isQName } from "./qname.js";
import { attributeName, elementName, splitQName } from "./resultNamespaces.js";
import { resolvePrefix } from "./stylesheetNamespaces.js";

/**
 * @typedef {object} ComputedName
 * @property {{namespaceUri: (string|null), qname: string}} [name] - The
 *   expanded name, when valid
 * @property {string} [error] - Why no node can be created, when invalid
 */

/**
 * Check the parts shared by element and attribute names.
 *
 * @param {string} kind - "element" or "attribute", used in messages
 * @param {string} qname - The evaluated `name` attribute
 * @param {string|null} namespace - The evaluated `namespace` attribute, null when absent
 * @param {Object<string, string>} scope - Namespaces in scope on the instruction
 * @returns {string|null} The error message, or null when the name is usable
 */
function nameError(kind, qname, namespace, scope) {
  if (!isQName(qname)) {
    return `xsl:${kind}: "${qname}" is not a valid ${kind} name (QName), the ${kind} is not created`;
  }
  const { prefix } = splitQName(qname);
  if (namespace === null && prefix && !resolvePrefix(scope, prefix)) {
    return `xsl:${kind}: undefined namespace prefix "${prefix}" in "${qname}", the ${kind} is not created`;
  }
  return null;
}

/**
 * Resolve the name computed by `xsl:element`.
 *
 * @param {string} qname - The evaluated `name` attribute
 * @param {string|null} namespace - The evaluated `namespace` attribute, null when absent
 * @param {Object<string, string>} scope - Namespaces in scope on the instruction
 * @returns {ComputedName} The expanded name, or the error to report
 *
 * @example
 * computedElementName("p:e", null, { p: "urn:p" }).name;
 * // { namespaceUri: "urn:p", qname: "p:e" }
 * computedElementName("x{", null, {}).error; // 'xsl:element: "x{" is not ...'
 */
export function computedElementName(qname, namespace, scope) {
  const error = nameError("element", qname, namespace, scope);
  return error ? { error } : { name: elementName(qname, namespace, scope) };
}

/**
 * Resolve the name computed by `xsl:attribute`; `xmlns` and `xmlns:*` are
 * rejected because namespace declarations are not attributes.
 *
 * @param {string} qname - The evaluated `name` attribute
 * @param {string|null} namespace - The evaluated `namespace` attribute, null when absent
 * @param {Object<string, string>} scope - Namespaces in scope on the instruction
 * @returns {ComputedName} The expanded name, or the error to report
 *
 * @example
 * computedAttributeName("xmlns", null, {}).error;
 * // 'xsl:attribute: "xmlns" cannot be used as an attribute name ...'
 */
export function computedAttributeName(qname, namespace, scope) {
  // With a namespace attribute, the prefix of `xmlns:a` is only a hint and
  // is replaced (libxslt REC/test-7.1.3)
  const xmlnsName =
    qname === "xmlns" || (namespace === null && qname.startsWith("xmlns:"));
  if (xmlnsName) {
    return {
      error: `xsl:attribute: "${qname}" cannot be used as an attribute name (XSLT 1.0 section 7.1.3), the attribute is not created`,
    };
  }
  const error = nameError("attribute", qname, namespace, scope);
  return error ? { error } : { name: attributeName(qname, namespace, scope) };
}
