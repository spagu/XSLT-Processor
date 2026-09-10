/**
 * Namespace Declaration Tracking
 *
 * Computes the `xmlns` declarations an element has to carry so that every
 * namespace is declared where it is first used and never twice.
 */

import { XMLNS_NAMESPACE, XML_NAMESPACE } from "./constants.js";

/**
 * Create the namespace scope in effect above the result tree root.
 *
 * @returns {Map<string, string>} Prefix (empty string for the default) to URI
 */
export function createNamespaceScope() {
  return new Map([
    ["", ""],
    ["xml", XML_NAMESPACE],
  ]);
}

/**
 * Collect the namespace declarations an element must emit.
 *
 * @param {Element} element - Element being serialized
 * @param {Map<string, string>} scope - Namespace scope inherited from the parent
 * @returns {{declarations: Array<{prefix: string, uri: string}>, scope: Map<string, string>}}
 *   The declarations to write and the scope in effect for the children
 */
export function collectNamespaceDeclarations(element, scope) {
  const declarations = [];
  let next = scope;

  /**
   * Record a declaration when the binding is not already in scope.
   * @param {string} prefix - Namespace prefix, empty for the default namespace
   * @param {string} uri - Namespace URI
   * @returns {void}
   */
  const declare = (prefix, uri) => {
    if (next.get(prefix) === uri) {
      return;
    }
    if (next === scope) {
      next = new Map(scope);
    }
    next.set(prefix, uri);
    declarations.push({ prefix, uri });
  };

  declare(element.prefix || "", element.namespaceURI || "");

  const attributes = Array.from(element.attributes || []);

  for (const attribute of attributes) {
    if (attribute.namespaceURI !== XMLNS_NAMESPACE && attribute.prefix) {
      declare(attribute.prefix, attribute.namespaceURI || "");
    }
  }

  for (const attribute of attributes) {
    if (attribute.namespaceURI === XMLNS_NAMESPACE) {
      declare(attribute.prefix ? attribute.localName : "", attribute.value);
    }
  }

  return { declarations, scope: next };
}
