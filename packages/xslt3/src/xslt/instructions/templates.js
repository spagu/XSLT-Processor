/**
 * Template invocation instructions: xsl:apply-templates,
 * xsl:call-template, xsl:apply-imports and xsl:next-match, with their
 * xsl:with-param children (XSLT 3.0 sections 6 and 10.1).
 *
 * @module @tradik/xslt3/xslt/instructions/templates
 */

import { isNode } from "../../xdm/atomic.js";
import { required } from "../compiler/attributes.js";
import { derive, evaluate } from "../runtime/context.js";
import {
  applyBuiltIn,
  applyTemplates,
  invokeTemplate,
} from "../runtime/apply.js";
import {
  attr,
  clarkOf,
  declaredName,
  isXsl,
  XSL_NS,
  xsltError,
} from "../names.js";
import { compileSorts } from "./sort.js";
import { compileWithParams } from "./params.js";

/**
 * Checks the children of an invocation instruction.
 * @param {Element} element
 * @param {Node[]} children
 * @param {string[]} allowed - Local names allowed
 */
function checkChildren(element, children, allowed) {
  for (const child of children) {
    const ok =
      child.nodeType === 1 &&
      child.namespaceURI === element.namespaceURI &&
      allowed.includes(child.localName);
    if (!ok) {
      throw xsltError(
        "XTSE0010",
        `xsl:${element.localName} may only contain ${allowed.join(", ")}`,
      );
    }
  }
}

/**
 * xsl:apply-templates.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileApplyTemplates(element, cx, scope) {
  const children = cx.children(element);
  checkChildren(element, children, ["sort", "with-param"]);
  const selectText = attr(element, "select");
  const select = cx.exprs.xpath(
    selectText ?? "child::node()",
    element,
    scope.vars,
  );
  const mode = cx.modeRef(attr(element, "mode"), element);
  const sort = compileSorts(
    children.filter((child) => isXsl(child, "sort")),
    cx,
    scope,
  );
  const params = compileWithParams(children, cx, scope);
  return (xc, out, machine) => {
    if (selectText === undefined && !isNode(xc.item)) {
      throw xsltError(
        xc.item === undefined ? "XPDY0002" : "XTTE0510",
        "xsl:apply-templates without select needs a context node",
      );
    }
    // XSLT 3.0 applies templates to atomic values too (no XTTE0520)
    const items = sort(evaluate(select, xc), xc, machine);
    const target = mode.current ? xc.mode : cx.mode(mode.name);
    applyTemplates(
      items,
      target,
      xc,
      out,
      machine,
      params.evaluate(xc, machine),
    );
  };
}

/**
 * xsl:call-template.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileCallTemplate(element, cx, scope) {
  const children = cx.children(element);
  checkChildren(element, children, ["with-param"]);
  const qname = cx.exprs.qname(required(element, "name"), element);
  const key =
    cx.originalName("template", clarkOf(qname)) ??
    clarkOf(declaredName(qname, `{${XSL_NS}}initial-template`));
  const params = compileWithParams(children, cx, scope);
  cx.deferred.push(() => cx.checkCall(key, params, element));
  return (xc, out, machine) => {
    const template = cx.namedTemplates.get(key);
    invokeTemplate(template, xc, out, machine, params.evaluate(xc, machine));
  };
}

/**
 * xsl:apply-imports and xsl:next-match.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileApplyImports(element, cx, scope) {
  const children = cx.children(element);
  const next = element.localName === "next-match";
  // xsl:next-match may have xsl:fallback children (ignored: it exists)
  checkChildren(
    element,
    children,
    next ? ["with-param", "fallback"] : ["with-param"],
  );
  const params = compileWithParams(children, cx, scope);
  return (xc, out, machine) => {
    const current = xc.rule;
    if (!current) {
      throw xsltError(
        "XTDE0560",
        `xsl:${element.localName} needs a current template rule`,
      );
    }
    const { template } = current;
    const accept = next
      ? (rule) => rule.rank > current.rank
      : (rule) =>
          rule.precedence < template.precedence &&
          rule.precedence >= template.importLow;
    const mode = xc.mode;
    const args = params.evaluate(xc, machine);
    const rule = mode.find(xc.item, xc, accept);
    if (rule) {
      invokeTemplate(rule.template, derive(xc, { rule }), out, machine, args);
    } else applyBuiltIn(xc.item, xc, mode, out, machine, args);
  };
}
