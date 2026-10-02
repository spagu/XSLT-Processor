/**
 * Static variables declared more than once (XSLT 3.0 section 9.7): a
 * declaration that comes later in stylesheet tree order than one of
 * lower import precedence must be consistent with it (the same value),
 * else XTSE3450; one of lower precedence than an earlier declaration is
 * left out. The precedence of declarations met in tree order is told by
 * their import paths: a declaration inside an import of the module of
 * another has the lower precedence.
 *
 * @module @tradik/xslt3/xslt/compiler/staticVariables
 */

import { isAtomic } from "../../xdm/atomic.js";
import { canonicalString } from "../../xdm/lexical.js";
import { xsltError } from "../names.js";

/**
 * A static declaration.
 * @typedef {object} StaticDeclaration
 * @property {Element} element
 * @property {Array} value
 * @property {number[]} path - The xsl:import elements it is inside
 */

/**
 * @param {number[]} outer
 * @param {number[]} inner
 * @returns {boolean} whether `outer` is a prefix of `inner`
 */
const isPrefix = (outer, inner) =>
  outer.length <= inner.length && outer.every((step, i) => inner[i] === step);

/**
 * Whether two declarations are consistent: the same kind (variable or
 * param), type and value.
 * @param {StaticDeclaration} a
 * @param {StaticDeclaration} b
 * @returns {boolean}
 */
const consistent = (a, b) =>
  a.element.localName === b.element.localName &&
  a.element.getAttribute("as")?.trim() ===
    b.element.getAttribute("as")?.trim() &&
  sameValue(a.value, b.value);

/**
 * @param {Array} a
 * @param {Array} b
 * @returns {boolean} whether two values are the same
 */
function sameValue(a, b) {
  return (
    a.length === b.length &&
    a.every((item, i) => {
      const other = b[i];
      if (!isAtomic(item) || !isAtomic(other)) return item === other;
      return (
        item.type === other.type &&
        canonicalString(item) === canonicalString(other)
      );
    })
  );
}

/**
 * Records a static variable, checked against an earlier declaration of
 * the name.
 * @param {{statics: Map, staticDeclarations: Map}} stage - The static
 *   stage (values and declarations by Clark name)
 * @param {string} key - Clark name
 * @param {StaticDeclaration} declaration
 * @throws {import("../../errors.js").XPathError} XTSE3450
 */
export function declareConsistently(stage, key, declaration) {
  const earlier = stage.staticDeclarations.get(key);
  if (earlier && earlier.element === declaration.element) return;
  if (earlier && earlier.path.length !== declaration.path.length) {
    // the earlier one is outside the import holding this one: it wins
    if (isPrefix(earlier.path, declaration.path)) return;
  }
  if (
    earlier &&
    !isPrefix(earlier.path, declaration.path) &&
    !consistent(earlier, declaration)
  ) {
    throw xsltError(
      "XTSE3450",
      `The static variable ${key} is declared with another value`,
    );
  }
  stage.staticDeclarations.set(key, declaration);
  stage.statics.set(key, declaration.value);
}
