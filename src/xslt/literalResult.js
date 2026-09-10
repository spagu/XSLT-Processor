/**
 * Literal result element support: namespace aliasing and attribute filtering.
 *
 * `xsl:namespace-alias` rewrites the namespace of literal result elements and
 * attributes, which is what makes it possible for a stylesheet to generate
 * another stylesheet. Attribute filtering keeps XSLT-only attributes such as
 * `xsl:use-attribute-sets` out of the result tree.
 */

"use strict";

/**
 * Resolve a namespace prefix against the declarations in scope of a node.
 *
 * Falls back to walking `xmlns` attributes when the DOM implementation does not
 * provide `lookupNamespaceURI`.
 *
 * @param {Element} node - The element whose scope is searched
 * @param {string|null} prefix - The prefix, or null for the default namespace
 * @returns {string|null} The namespace URI, or null when undeclared
 *
 * @example
 * lookupNamespaceUri(stylesheetElement, 'xsl');
 */
export function lookupNamespaceUri(node, prefix) {
  if (typeof node.lookupNamespaceURI === "function") {
    const found = node.lookupNamespaceURI(prefix);
    if (found) return found;
  }

  const attributeName = prefix ? `xmlns:${prefix}` : "xmlns";
  let current = node;

  while (current?.nodeType === 1) {
    const value = current.getAttribute(attributeName);
    if (value) return value;
    current = current.parentNode;
  }

  return null;
}

/**
 * The `xsl:namespace-alias` declarations of a stylesheet.
 */
export class NamespaceAliasMap {
  constructor() {
    this.byUri = new Map();
  }

  /**
   * Record one `xsl:namespace-alias` declaration.
   *
   * @param {Element} node - The `xsl:namespace-alias` element
   * @returns {void}
   *
   * @example
   * aliases.add(namespaceAliasElement);
   */
  add(node) {
    const stylesheetPrefix = node.getAttribute("stylesheet-prefix");
    const resultPrefix = node.getAttribute("result-prefix");
    if (!stylesheetPrefix || !resultPrefix) return;

    const fromUri = lookupNamespaceUri(
      node,
      stylesheetPrefix === "#default" ? null : stylesheetPrefix,
    );
    if (!fromUri) return;

    const isDefaultResult = resultPrefix === "#default";
    const toUri = lookupNamespaceUri(
      node,
      isDefaultResult ? null : resultPrefix,
    );

    this.byUri.set(fromUri, {
      uri: toUri,
      prefix: isDefaultResult ? null : resultPrefix,
    });
  }

  /**
   * Whether any alias was declared.
   *
   * @returns {boolean} True when at least one alias is known
   *
   * @example
   * aliases.isEmpty();
   */
  isEmpty() {
    return this.byUri.size === 0;
  }

  /**
   * Apply aliasing to a literal result name.
   *
   * @param {string|null} namespaceUri - The namespace of the stylesheet node
   * @param {string} localName - The local name of the stylesheet node
   * @returns {{namespaceUri: (string|null), qname: string}|null} The aliased name, or null when no alias applies
   *
   * @example
   * aliases.resolve('http://www.w3.org/1999/XSL/TransformAlias', 'stylesheet');
   * // { namespaceUri: 'http://www.w3.org/1999/XSL/Transform', qname: 'xsl:stylesheet' }
   */
  resolve(namespaceUri, localName) {
    const alias = namespaceUri ? this.byUri.get(namespaceUri) : undefined;
    if (!alias) return null;

    return {
      namespaceUri: alias.uri,
      qname: alias.prefix ? `${alias.prefix}:${localName}` : localName,
    };
  }
}

/**
 * Whether an attribute of a literal result element is copied to the output.
 *
 * Namespace declarations are re-created from the element namespaces themselves,
 * and every XSLT attribute (`xsl:use-attribute-sets`, `xsl:version`,
 * `xsl:exclude-result-prefixes`, `xsl:extension-element-prefixes`) is an
 * instruction to the processor rather than result tree content.
 *
 * @param {Attr} attribute - The attribute of the stylesheet element
 * @param {string} xsltNamespace - The XSLT namespace URI
 * @returns {boolean} True when the attribute belongs in the result
 *
 * @example
 * shouldCopyAttribute(attr, 'http://www.w3.org/1999/XSL/Transform');
 */
export function shouldCopyAttribute(attribute, xsltNamespace) {
  if (attribute.namespaceURI === xsltNamespace) return false;
  if (attribute.name === "xmlns" || attribute.name.startsWith("xmlns:")) {
    return false;
  }
  return !attribute.name.startsWith("xsl:");
}

/**
 * Read an XSLT attribute from a literal result element.
 *
 * Works both for namespace aware DOMs and for documents where the attribute is
 * only known by its `xsl:` qualified name.
 *
 * @param {Element} node - The literal result element
 * @param {string} localName - The XSLT attribute local name
 * @param {string} xsltNamespace - The XSLT namespace URI
 * @returns {string|null} The attribute value, or null when absent
 *
 * @example
 * getXsltAttribute(element, 'use-attribute-sets', XSLT_NS);
 */
export function getXsltAttribute(node, localName, xsltNamespace) {
  if (!node.attributes) return null;

  for (const attribute of node.attributes) {
    const matchesNamespace =
      attribute.namespaceURI === xsltNamespace &&
      (attribute.localName || attribute.name) === localName;
    if (matchesNamespace || attribute.name === `xsl:${localName}`) {
      return attribute.value;
    }
  }

  return null;
}
