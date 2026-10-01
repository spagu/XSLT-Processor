/**
 * Overriding declarations (XSLT 3.0 sections 3.5.3.3 and 3.5.3.4)
 * compiled into the component they override, so that the references of
 * the used package reach them; the overridden body is kept for the name
 * xsl:original, and template rules join the used package's mode.
 *
 * @module @tradik/xslt3/xslt/compiler/overrideLinks
 */

import { callFunction } from "../runtime/functionCall.js";
import { ORIGINAL, XSL_NS, xsltError } from "../names.js";
import { declareAttributeSet } from "../instructions/attributeSets.js";
import { ExpressionCompiler } from "./expressions.js";
import { compileFunction, functionSignature } from "./globals.js";
import { LEVEL_PRECEDENCE } from "./packageTable.js";
import { declareTemplate } from "./templatesDecl.js";

/**
 * Whether an overriding declaration refers to xsl:original.
 * @param {Element} element
 * @returns {boolean}
 */
export function usesOriginal(element) {
  const stack = [element];
  while (stack.length > 0) {
    const node = stack.pop();
    for (const attribute of node.attributes) {
      if (attribute.value.includes("xsl:original")) return true;
    }
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) stack.push(c);
    }
  }
  return false;
}

/**
 * Compiles an overriding declaration while xsl:original names the
 * overridden component.
 * @param {object} cx
 * @param {object} entry - `{kind, key}` of the overridden component
 * @param {() => *} compile
 * @returns {*} what compile returns
 */
function overriding(cx, entry, compile) {
  cx.overriding = entry;
  try {
    return compile();
  } finally {
    cx.overriding = null;
  }
}

/**
 * Compiles an overriding function into the overridden one; its
 * xsl:original() calls the overridden body.
 * @param {object} cx
 * @param {Element} element
 * @param {object} component - The overridden function
 */
function overrideFunction(cx, element, component) {
  const signature = functionSignature({ element }, cx);
  const original = { ...component.cell };
  const saved = cx.exprs;
  cx.exprs = new ExpressionCompiler({
    library: saved.library.extend([
      {
        namespace: XSL_NS,
        local: "original",
        params: Array(signature.arity).fill("item()*"),
        returns: "item()*",
        impl: (args, context) => callFunction(original, args, context),
      },
    ]),
    decimalFormats: saved.decimalFormats,
    owner: cx,
  });
  try {
    Object.assign(component.cell, compileFunction(signature, cx));
  } finally {
    cx.exprs = saved;
  }
}

/**
 * Compiles an overriding attribute set into the parts of the overridden
 * one.
 * @param {object} cx
 * @param {Element} element
 * @param {object} component - The overridden attribute set
 */
function overrideAttributeSet(cx, element, component) {
  const parts = cx.attributeSets.get(component.key);
  cx.attributeSets.delete(component.key);
  overriding(cx, component, () => declareAttributeSet(element, cx));
  const original = [...parts];
  parts.splice(0, parts.length, ...cx.attributeSets.get(component.key));
  cx.attributeSets.set(component.key, parts);
  cx.attributeSets.set(`${ORIGINAL}#${component.key}`, original);
}

/**
 * Compiles an overriding named template into the overridden one.
 * @param {object} cx
 * @param {object} declaration - `{element, precedence, importLow}`
 * @param {object} component - The overridden template
 */
function overrideTemplate(cx, declaration, component) {
  const cell = cx.namedTemplates.get(component.key);
  overriding(cx, component, () => declareTemplate(declaration, cx));
  const original = { ...cell };
  Object.assign(cell, cx.namedTemplates.get(component.key));
  cx.namedTemplates.set(component.key, cell);
  cx.namedTemplates.set(`${ORIGINAL}#${component.key}`, original);
}

/**
 * Compiles the overriding declarations of this package's
 * xsl:use-package elements and links them (overriding variables are
 * linked by their slots, see packageTable.js).
 * @param {object} cx
 * @param {number} level - Import precedences start at level * 1e6
 */
export function linkOverrides(cx, level) {
  for (const use of cx.uses) {
    for (const { element, component } of use.overrides) {
      if (component?.visibility === "abstract" && usesOriginal(element)) {
        throw xsltError("XTSE3075", "The overridden component is abstract");
      }
      const precedence = level * LEVEL_PRECEDENCE + use.precedence;
      const declaration = { element, precedence, importLow: precedence };
      const kind = component?.kind;
      if (kind === "function") overrideFunction(cx, element, component);
      else if (kind === "attribute-set") {
        overrideAttributeSet(cx, element, component);
      } else if (kind === "template") {
        overrideTemplate(cx, declaration, component);
      } else if (kind === undefined) declareTemplate(declaration, cx);
    }
  }
}
