/**
 * Functions on QNames that need no node (F&O 3.1 section 10.2): QName,
 * prefix-from-QName, local-name-from-QName and namespace-uri-from-QName.
 * fn:resolve-QName and fn:namespace-uri-for-prefix need in-scope
 * namespaces of an element and belong to the evaluator.
 *
 * @module @tradik/xslt3/functions/qnames
 */

import { XPathError } from "../errors.js";
import { AtomicValue } from "../xdm/atomic.js";
import { QNameValue } from "../xdm/qname.js";
import { namePatterns, types } from "../xdm/types.js";
import { define } from "./support.js";

/**
 * fn:QName on strings.
 * @param {string} uri - "" for no namespace
 * @param {string} lexical - "prefix:local" or "local"
 * @returns {QNameValue}
 * @throws {XPathError} FOCA0002 for an invalid lexical QName or a prefix
 *   without namespace
 */
export function makeQName(uri, lexical) {
  const parts = lexical.split(":");
  if (
    parts.length > 2 ||
    !parts.every((part) => namePatterns.ncName.test(part)) ||
    (parts.length === 2 && uri === "")
  ) {
    throw new XPathError("FOCA0002", `Invalid QName "${lexical}"`);
  }
  const [prefix, local] = parts.length === 2 ? parts : ["", parts[0]];
  return new QNameValue(uri, local, prefix);
}

/**
 * Declares an accessor of an optional xs:QName.
 * @param {string} local
 * @param {string} returns
 * @param {(q: QNameValue) => AtomicValue|null} access
 * @returns {import("./support.js").FunctionDefinition}
 */
const accessor = (local, returns, access) =>
  define(local, ["xs:QName?"], returns, ([q]) => {
    const result = q.length === 0 ? null : access(q[0].value);
    return result === null ? [] : [result];
  });

/** @type {import("./support.js").FunctionDefinition[]} */
export const qnameFunctions = [
  define("QName", ["xs:string?", "xs:string"], "xs:QName", ([uri, [q]]) => [
    new AtomicValue(types.QName, makeQName(uri[0]?.value ?? "", q.value)),
  ]),
  accessor("prefix-from-QName", "xs:NCName?", (q) =>
    q.prefix === "" ? null : new AtomicValue(types.NCName, q.prefix),
  ),
  accessor(
    "local-name-from-QName",
    "xs:NCName?",
    (q) => new AtomicValue(types.NCName, q.localName),
  ),
  accessor(
    "namespace-uri-from-QName",
    "xs:anyURI?",
    (q) => new AtomicValue(types.anyURI, q.namespaceURI),
  ),
];
