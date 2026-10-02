/**
 * Namespace fixup: the namespace declarations written on an element so
 * that its name, its attributes' names and its in-scope namespaces are
 * declared, whether or not the DOM holds `xmlns` attributes for them
 * (createElementNS and setAttributeNS add none). A namespaced attribute
 * without a usable prefix gets one (an existing one for its namespace, or
 * ns0, ns1, ...).
 *
 * A scope is a Map from prefix ("" for the default namespace) to URI,
 * shared by the elements that declare nothing and copied on change.
 *
 * @module @tradik/xslt3/serialize/markup/namespaces
 */

import {
  isNamespaceDeclaration,
  XMLNS_NAMESPACE,
} from "../../xpath/eval/domNodes.js";
import {
  inScopeNamespaces,
  XML_NAMESPACE,
} from "../../xpath/eval/namespaceNodes.js";

export { XML_NAMESPACE };

/**
 * @typedef {object} FixedElement
 * @property {string} name - Output name of the element
 * @property {string} namespaceURI - Its namespace, "" for none
 * @property {Array<[string, string]>} declarations - [prefix, URI] to declare
 * @property {Array<{name: string, localName: string, namespaceURI: string, value: string}>} attributes
 * @property {Map<string, string>} scope - Scope of the children
 */

/**
 * @typedef {object} FixupOptions
 * @property {boolean} top - The element is the first one written of its
 *   tree: its inherited namespaces are declared too
 * @property {Set<string>} unprefixed - Namespaces whose elements are
 *   written without a prefix (HTML5 prefix normalization)
 * @property {boolean} undeclare - Write `xmlns:p=""` undeclarations (XML
 *   1.1 with undeclare-prefixes)
 */

/**
 * Bindings an element asks for, in order: inherited ones (top element),
 * its own declarations, its name.
 * @param {Element} element
 * @param {string} prefix - Output prefix of the element
 * @param {FixupOptions} options
 * @returns {Map<string, string>}
 */
function wantedBindings(element, prefix, options) {
  const wanted = new Map();
  const add = (p, uri) => {
    if (p === "xml") return;
    if (p !== "" && options.unprefixed.has(uri)) return;
    wanted.set(p, uri);
  };
  if (options.top) {
    for (const [p, uri] of inScopeNamespaces(element)) {
      if (uri !== "" || p === "") add(p, uri);
    }
  }
  for (const attribute of element.attributes) {
    if (isNamespaceDeclaration(attribute)) {
      const name = attribute.name;
      add(name === "xmlns" ? "" : name.slice(6), attribute.value);
    }
  }
  wanted.set(prefix, element.namespaceURI ?? "");
  return wanted;
}

/**
 * Chooses the prefix of a namespaced attribute.
 * @param {Attr} attribute
 * @param {string} uri - Its namespace
 * @param {(prefix: string) => string|undefined} bound - Current binding
 * @param {Map<string, string>} wanted
 * @param {Map<string, string>} scope - Scope of the parent
 * @returns {string} the prefix
 */
function attributePrefix(attribute, uri, bound, wanted, scope) {
  const own = attribute.prefix ?? "";
  if (own !== "" && (bound(own) === undefined || bound(own) === uri)) {
    return own;
  }
  for (const map of [wanted, scope]) {
    for (const [p, u] of map) {
      if (p !== "" && u === uri && bound(p) === uri) return p;
    }
  }
  let n = 0;
  while (bound(`ns${n}`) !== undefined) n++;
  return `ns${n}`;
}

/**
 * Computes the names and the namespace declarations of an element.
 * @param {Element} element
 * @param {Map<string, string>} scope - Scope of the parent
 * @param {FixupOptions} options
 * @returns {FixedElement}
 */
export function fixupElement(element, scope, options) {
  const namespaceURI = element.namespaceURI ?? "";
  const localName = element.localName ?? element.nodeName;
  const prefix = options.unprefixed.has(namespaceURI)
    ? ""
    : (element.prefix ?? "");
  const wanted = wantedBindings(element, prefix, options);
  const bound = (p) =>
    wanted.has(p) ? wanted.get(p) : (scope.get(p) ?? (p ? undefined : ""));
  const attributes = [];
  for (const attribute of element.attributes) {
    if (isNamespaceDeclaration(attribute)) continue;
    const uri = attribute.namespaceURI ?? "";
    const local = attribute.localName ?? attribute.name;
    let name = local;
    if (uri === XML_NAMESPACE) {
      name = `xml:${local}`;
    } else if (uri !== "" && uri !== XMLNS_NAMESPACE) {
      const p = attributePrefix(attribute, uri, bound, wanted, scope);
      if (bound(p) !== uri) wanted.set(p, uri);
      name = `${p}:${local}`;
    }
    const value = attribute.value;
    attributes.push({ name, localName: local, namespaceURI: uri, value });
  }
  const declarations = [];
  let childScope = scope;
  for (const [p, uri] of wanted) {
    const current = scope.get(p) ?? (p ? undefined : "");
    if (current === uri) continue;
    if (uri === "" && p !== "") {
      if (!options.undeclare || current === undefined) continue;
    }
    declarations.push([p, uri]);
    if (childScope === scope) childScope = new Map(scope);
    childScope.set(p, uri);
  }
  const name = prefix ? `${prefix}:${localName}` : localName;
  return { name, namespaceURI, declarations, attributes, scope: childScope };
}
