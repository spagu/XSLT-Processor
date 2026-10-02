/**
 * Resolution of the type names written in an expression: atomic and union
 * types of sequence types and casts, and the type annotations of element()
 * and attribute() tests. Without a schema the in-scope schema types are
 * the built-in ones; nodes are untyped (elements xs:untyped, attributes
 * xs:untypedAtomic).
 *
 * @module @tradik/xslt3/xpath/eval/typeNames
 */

import { XPathError } from "../../errors.js";
import { getType, types, XS_NAMESPACE } from "../../xdm/types.js";
import { namespaceOf } from "./staticContext.js";

/** Members of the union type xs:numeric. */
export const NUMERIC_MEMBERS = Object.freeze([
  types.double,
  types.float,
  types.decimal,
]);

/** Built-in types that are neither atomic nor unions. */
const COMPLEX_OR_SIMPLE = new Set(["anyType", "anySimpleType", "untyped"]);

/**
 * @param {import("../syntax/ast.js").QName} name
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {{uri: string, local: string}} the expanded type name (the
 *   default element/type namespace applies)
 */
function expand(name, sc) {
  return {
    uri: namespaceOf(name, sc, sc.defaultElementNamespace),
    local: name.local,
  };
}

/**
 * Looks up a built-in atomic type by local name.
 * @param {string} local
 * @returns {object|null}
 */
function builtIn(local) {
  try {
    return getType(local);
  } catch {
    return null;
  }
}

/**
 * Resolves the name of a generalized atomic type (an atomic type or
 * xs:numeric) to its member types.
 * @param {import("../syntax/ast.js").QName} name
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {object[]} atomic type descriptors (several for a union)
 * @throws {XPathError} XPST0051 when the name is not a known atomic or
 *   union type, XPST0081 for an undeclared prefix
 */
export function resolveAtomicType(name, sc) {
  const { uri, local } = expand(name, sc);
  if (uri === XS_NAMESPACE) {
    if (local === "numeric") return NUMERIC_MEMBERS;
    const type = builtIn(local);
    if (type) return [type];
  }
  throw new XPathError(
    "XPST0051",
    `${name.prefix ? `${name.prefix}:` : ""}${local} is not an atomic type`,
  );
}

/**
 * Whether a type is a known schema type (for the type annotation of an
 * element() or attribute() test).
 * @param {{uri: string, local: string}} name
 * @returns {boolean}
 */
const isKnownType = ({ uri, local }) =>
  uri === XS_NAMESPACE &&
  (COMPLEX_OR_SIMPLE.has(local) || local === "numeric" || !!builtIn(local));

/**
 * Whether untyped nodes of a kind have, or derive from, a type annotation.
 * @param {import("../syntax/ast.js").QName} name - Type in an element() or
 *   attribute() test
 * @param {"element"|"attribute"} kind
 * @param {import("./staticContext.js").StaticContext} sc
 * @returns {boolean} true when the nodes match the annotation
 * @throws {XPathError} XPST0008 for an unknown type
 */
export function untypedMatches(name, kind, sc) {
  const expanded = expand(name, sc);
  if (!isKnownType(expanded)) {
    throw new XPathError("XPST0008", `Unknown type ${name.local}`);
  }
  const { local } = expanded;
  if (local === "anyType") return true;
  if (kind === "element") return local === "untyped";
  return ["anySimpleType", "anyAtomicType", "untypedAtomic"].includes(local);
}
