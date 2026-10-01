/**
 * xs:QName and xs:NOTATION values: `{ prefix, namespaceURI, localName }`,
 * with "" for no prefix and no namespace. Casting from a string needs a
 * namespace resolver for the prefix.
 *
 * @module @tradik/xslt3/xdm/qname
 */

import { XPathError } from "../errors.js";
import { namePatterns } from "./types.js";

/** A qualified name. */
export class QNameValue {
  /**
   * @param {string} namespaceURI - "" for no namespace
   * @param {string} localName
   * @param {string} [prefix=""]
   */
  constructor(namespaceURI, localName, prefix = "") {
    this.namespaceURI = namespaceURI;
    this.localName = localName;
    this.prefix = prefix;
    Object.freeze(this);
  }

  /** @returns {string} "prefix:local" or "local" */
  toString() {
    return this.prefix ? `${this.prefix}:${this.localName}` : this.localName;
  }
}

/**
 * Resolves a namespace prefix ("" for the default namespace used for
 * unprefixed names) to a URI, or returns null/undefined when unbound.
 * @callback NamespaceResolver
 * @param {string} prefix
 * @returns {string|null|undefined}
 */

/**
 * Parses a lexical QName (whitespace already collapsed).
 * @param {string} text
 * @param {NamespaceResolver} [resolveNamespace] - Without it only
 *   unprefixed names can be cast, and they get no namespace
 * @returns {QNameValue|null} null when the text is not a lexical QName
 * @throws {XPathError} FONS0004 when the prefix is not bound
 */
export function parseQName(text, resolveNamespace) {
  const parts = text.split(":");
  if (
    parts.length > 2 ||
    !parts.every((part) => namePatterns.ncName.test(part))
  ) {
    return null;
  }
  const [prefix, localName] = parts.length === 2 ? parts : ["", parts[0]];
  const namespaceURI = resolveNamespace?.(prefix) ?? (prefix ? null : "");
  if (namespaceURI === null) {
    throw new XPathError(
      "FONS0004",
      `No namespace is bound to the prefix ${prefix}`,
    );
  }
  return new QNameValue(namespaceURI, localName, prefix);
}
