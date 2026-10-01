/**
 * The namespaces of an element under construction: its own namespace
 * nodes (from its name, its attributes' names and namespace
 * instructions) and those in scope from its ancestors, with the `xmlns`
 * declarations the DOM needs (XSLT 3.0 section 5.7.3, namespace fixup).
 *
 * @module @tradik/xslt3/xslt/runtime/namespaceScope
 */

import { XML_NS, XMLNS_NS } from "../names.js";

/**
 * @param {string} qname
 * @returns {string} the prefix of a lexical QName, "" for none
 */
export const prefixOf = (qname) => {
  const colon = qname.indexOf(":");
  return colon < 0 ? "" : qname.slice(0, colon);
};

/** Namespace bookkeeping of the element a receiver builds. */
export class NamespaceScope {
  /**
   * @param {Node} parent - The element (or document) built
   * @param {Map<string, string>} namespaces - In scope at its parent
   */
  constructor(parent, namespaces) {
    this.parent = parent;
    this.inherited = namespaces;
    this.namespaces = namespaces;
    this.ownNamespaces = false;
    /** @type {Map<string, string>|null} namespace nodes of this element */
    this.own = null;
    /** @type {Set<string>} prefixes of namespace nodes added explicitly */
    this.explicit = new Set();
    /** @type {((old: Element, element: Element) => void)|null} */
    this.onReplace = null;
  }

  /**
   * Gives the element a namespace node that conflicts with the prefix of
   * its name: the element is renamed with a new prefix (namespace fixup).
   * @param {string} prefix
   * @param {string} uri
   * @returns {boolean} false when the conflict is not with the name, or
   *   when the name's namespace node was itself added explicitly
   */
  rebind(prefix, uri) {
    const old = this.parent;
    if (prefix === "" || old.prefix !== prefix || this.explicit.has(prefix)) {
      return false;
    }
    let fresh;
    for (let i = 0; this.namespaces.has((fresh = `${prefix}_${i}`)); i++);
    const element = old.ownerDocument.createElementNS(
      old.namespaceURI,
      `${fresh}:${old.localName}`,
    );
    for (const attribute of old.attributes) {
      if (attribute.name === `xmlns:${prefix}`) continue;
      element.setAttributeNS(
        attribute.namespaceURI,
        attribute.name,
        attribute.value,
      );
    }
    old.parentNode?.replaceChild(element, old);
    this.onReplace?.(old, element);
    this.parent = element;
    this.own.delete(prefix);
    if (this.ownNamespaces) {
      const before = this.inherited.get(prefix);
      if (before === undefined) this.namespaces.delete(prefix);
      else this.namespaces.set(prefix, before);
    }
    this.declare(fresh, old.namespaceURI);
    return this.declare(prefix, uri);
  }

  /**
   * Gives the element a namespace node, declared when not in scope.
   * @param {string} prefix
   * @param {string} uri
   * @returns {boolean} false when the element already binds the prefix to
   *   another URI
   */
  declare(prefix, uri) {
    if (prefix === "xml") return uri === XML_NS;
    const own = this.own?.get(prefix);
    if (own !== undefined) return own === uri;
    if (prefix !== "" && uri === "") return true;
    if (!this.own) this.own = new Map();
    this.own.set(prefix, uri);
    if ((this.namespaces.get(prefix) ?? "") !== uri) {
      if (!this.ownNamespaces) {
        this.namespaces = new Map(this.namespaces);
        this.ownNamespaces = true;
      }
      this.namespaces.set(prefix, uri);
      const name = prefix === "" ? "xmlns" : `xmlns:${prefix}`;
      this.parent.setAttributeNS(XMLNS_NS, name, uri);
    }
    return true;
  }

  /**
   * Gives the element a namespace node that it must keep (copied by a
   * literal result element or xsl:copy, or built by xsl:namespace): two
   * such nodes for one prefix conflict (XTDE0430), rather than causing a
   * namespace fixup.
   * @param {string} prefix
   * @param {string} uri
   * @returns {boolean} as {@link NamespaceScope#declare}
   */
  declareExplicit(prefix, uri) {
    const declared = this.declare(prefix, uri);
    if (declared) this.explicit.add(prefix);
    return declared;
  }

  /**
   * A prefix bound to a URI on the element, declared when needed: one in
   * scope, else `base_1`, `base_2`... (`ns0`, `ns1`... without base).
   * @param {string} uri
   * @param {string} base - Preferred prefix, "" for none
   * @returns {string}
   */
  prefixFor(uri, base) {
    for (const [prefix, bound] of this.namespaces) {
      if (bound === uri && prefix !== "" && this.declare(prefix, uri)) {
        return prefix;
      }
    }
    for (let i = base ? 1 : 0; ; i++) {
      const prefix = base ? `${base}_${i}` : `ns${i}`;
      if (!this.namespaces.has(prefix) && this.declare(prefix, uri)) {
        return prefix;
      }
    }
  }
}
