/**
 * Attribute sets (XSLT 3.0 section 10.2): named groups of xsl:attribute
 * instructions, applied by use-attribute-sets on literal result elements,
 * xsl:element, xsl:copy and other attribute sets.
 *
 * @module @tradik/xslt3/xslt/instructions/attributeSets
 */

import { compileBody } from "../compiler/body.js";
import { required } from "../compiler/attributes.js";
import { derive } from "../runtime/context.js";
import { clarkOf, isXsl, tokens, xsltError } from "../names.js";

/**
 * Resolves the names of a use-attribute-sets attribute; their existence
 * is checked once the stylesheet is compiled (XTSE0710).
 * @param {string|undefined} text
 * @param {Element} element
 * @param {object} cx - Stylesheet compiler
 * @returns {string[]} Clark names
 */
export function attributeSetNames(text, element, cx) {
  const names = tokens(text).map((token) => {
    const name = clarkOf(cx.exprs.qname(token, element, { code: "XTSE0710" }));
    return cx.originalName("attribute-set", name) ?? name;
  });
  for (const name of names) {
    cx.deferred.push(() => {
      if (!cx.attributeSets.has(name)) {
        throw xsltError("XTSE0710", `No attribute set ${name}`);
      }
    });
  }
  return names;
}

/**
 * Compiles an xsl:attribute-set declaration into the registry.
 * @param {Element} element
 * @param {object} cx
 */
export function declareAttributeSet(element, cx) {
  const name = clarkOf(cx.exprs.qname(required(element, "name"), element));
  const children = cx.children(element);
  for (const child of children) {
    if (child.nodeType !== 1 || !isXsl(child, "attribute")) {
      throw xsltError(
        "XTSE0010",
        "An attribute set may only contain xsl:attribute",
      );
    }
  }
  const part = {
    uses: attributeSetNames(
      element.getAttribute("use-attribute-sets") || undefined,
      element,
      cx,
    ),
    body: compileBody(element, cx, cx.globalScope()),
    precedence: cx.precedenceOf(element),
    cx,
  };
  const parts = cx.attributeSets.get(name) ?? [];
  parts.push(part);
  parts.sort((a, b) => a.precedence - b.precedence);
  cx.attributeSets.set(name, parts);
}

/**
 * Adds the attributes of attribute sets to an element under construction.
 * @param {string[]} names - Clark names
 * @param {object} xc - XSLT context
 * @param {object} out - Receiver of the element's content
 * @param {import("../runtime/machine.js").Machine} machine
 * @param {object} cx - Stylesheet compiler
 * @param {Set<string>} [active] - Sets being applied (cycle detection)
 * @param {boolean} [crossed] - The chain went through another package
 */
export function applyAttributeSets(
  names,
  xc,
  out,
  machine,
  cx,
  active,
  crossed = false,
) {
  const applying = active ?? new Set();
  const context = derive(xc, { env: xc.tx.globalEnv });
  for (const name of names) {
    if (applying.has(name)) {
      // a cycle made by overriding in another package shows only when
      // the components are bound: a dynamic error (XSLT 3.0 10.2)
      throw xsltError(
        crossed ? "XTDE0640" : "XTSE0720",
        `The attribute set ${name} uses itself`,
      );
    }
    applying.add(name);
    for (const part of cx.attributeSets.get(name)) {
      const across = crossed || part.cx !== cx;
      applyAttributeSets(
        part.uses,
        xc,
        out,
        machine,
        part.cx,
        applying,
        across,
      );
      machine.runBody(part.body, context, out);
    }
    applying.delete(name);
  }
}
