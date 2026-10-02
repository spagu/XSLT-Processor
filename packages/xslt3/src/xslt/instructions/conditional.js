/**
 * xsl:on-empty, xsl:on-non-empty and xsl:where-populated (XSLT 3.0
 * section 8.4). The first two mark their step (`conditional`); the
 * sequence constructor that holds them is run by
 * runtime/conditional.js (see compileBody).
 *
 * @module @tradik/xslt3/xslt/instructions/conditional
 */

import { compileBody } from "../compiler/body.js";
import { isWhitespaceText } from "../compiler/children.js";
import { evaluate } from "../runtime/context.js";
import { isDeemedEmpty, stepItems } from "../runtime/conditional.js";
import { attr, isXsl, xsltError } from "../names.js";

/**
 * Compiles the content of xsl:on-empty or xsl:on-non-empty, which is
 * that of xsl:sequence.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
function compileContent(element, cx, scope) {
  const select = attr(element, "select");
  const children = cx.children(element).filter((c) => !isXsl(c, "fallback"));
  if (select === undefined) {
    const body = compileBody(element, cx, scope, children);
    return (xc, out, machine) => machine.runBody(body, xc, out);
  }
  if (children.length > 0) {
    throw xsltError(
      "XTSE3185",
      `xsl:${element.localName} cannot have select and content`,
    );
  }
  const expr = cx.exprs.xpath(select, element, scope.vars);
  return (xc, out) => {
    for (const item of evaluate(expr, xc)) out.item(item);
  };
}

/**
 * xsl:on-empty: the last instruction of its sequence constructor.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileOnEmpty(element, cx, scope) {
  const siblings = cx.children(element.parentNode);
  const after = siblings.slice(siblings.indexOf(element) + 1);
  const misplaced = after.some(
    (next) =>
      !isWhitespaceText(next) &&
      !isXsl(next, "fallback") &&
      !isXsl(next, "catch"),
  );
  if (misplaced) {
    throw xsltError(
      "XTSE0010",
      "xsl:on-empty must be the last instruction of a sequence constructor",
    );
  }
  const step = compileContent(element, cx, scope);
  step.conditional = "empty";
  return step;
}

/**
 * xsl:on-non-empty.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileOnNonEmpty(element, cx, scope) {
  const step = compileContent(element, cx, scope);
  step.conditional = "non-empty";
  return step;
}

/**
 * xsl:where-populated: the result of the content without the items
 * deemed empty.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileWherePopulated(element, cx, scope) {
  const body = compileBody(element, cx, scope);
  const run = (xc, out, machine) => machine.runBody(body, xc, out);
  return (xc, out, machine) => {
    for (const item of stepItems(run, xc, machine)) {
      if (!isDeemedEmpty(item)) out.item(item);
    }
  };
}
