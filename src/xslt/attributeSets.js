/**
 * Named attribute sets (XSLT 1.0 section 7.1.4).
 *
 * Every `xsl:attribute-set` declaration is kept: declarations with the same
 * expanded name are merged into one set. Applying a set applies its
 * declarations from the lowest import precedence to the highest (stylesheet
 * order within one precedence), each one its `use-attribute-sets` first and
 * then its own `xsl:attribute` children. A later attribute of the same name
 * replaces an earlier one, so attributes of a higher import precedence win
 * over imported ones and a declaration's own attributes win over the sets it
 * uses, as in libxslt.
 *
 * @module xslt/attributeSets
 */

"use strict";

import {
  requireExpandedName,
  requireExpandedNames,
} from "./declarationNames.js";

/**
 * @typedef {Object} AttributeSetDeclaration
 * @property {Element} node - The xsl:attribute-set element
 * @property {string[]} uses - Expanded names of its use-attribute-sets
 * @property {number} importPrecedence - Import precedence of its stylesheet
 */

/**
 * Register an `xsl:attribute-set` declaration.
 *
 * @param {Object<string, AttributeSetDeclaration[]>} sets - Declarations by
 *   expanded name; updated in place
 * @param {Element} node - The xsl:attribute-set element
 * @param {number} importPrecedence - Import precedence of its stylesheet
 * @returns {void}
 * @throws {Error} When the name or a used name is not a QName with a
 *   declared prefix (libxslt rejects such a stylesheet)
 */
export function registerAttributeSet(sets, node, importPrecedence) {
  const key = requireExpandedName(
    node.getAttribute("name") ?? "",
    node,
    "xsl:attribute-set name",
  );
  const uses = requireExpandedNames(
    node.getAttribute("use-attribute-sets"),
    node,
    "xsl:attribute-set use-attribute-sets",
  );
  const declarations = Object.hasOwn(sets, key) ? sets[key] : [];
  declarations.push({ node, uses, importPrecedence });
  // Stable sort: stylesheet order is kept within one import precedence
  declarations.sort((a, b) => a.importPrecedence - b.importPrecedence);
  sets[key] = declarations;
}

/**
 * Apply attribute sets to a result element.
 *
 * @param {Object<string, AttributeSetDeclaration[]>} sets - Declarations by expanded name
 * @param {string[]} keys - Expanded names of the sets to apply, in order
 * @param {(node: Element) => void} applyDeclaration - Instantiates the
 *   xsl:attribute children of one declaration
 * @param {Set<string>} [active] - Sets being applied (recursion guard)
 * @returns {void}
 * @throws {Error} When a set uses itself, directly or indirectly (an error
 *   in XSLT 1.0 section 7.1.4)
 *
 * @example
 * applyAttributeSets(engine.attributeSets, ["common"], (node) =>
 *   engine.processChildren(node, context, element));
 */
export function applyAttributeSets(
  sets,
  keys,
  applyDeclaration,
  active = new Set(),
) {
  for (const key of keys) {
    if (!Object.hasOwn(sets, key)) continue;
    if (active.has(key)) {
      throw new Error(
        `xsl:attribute-set ${key} uses itself (XSLT 1.0 section 7.1.4)`,
      );
    }
    active.add(key);
    for (const declaration of sets[key]) {
      applyAttributeSets(sets, declaration.uses, applyDeclaration, active);
      applyDeclaration(declaration.node);
    }
    active.delete(key);
  }
}
