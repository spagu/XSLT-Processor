/**
 * xsl:iterate, xsl:next-iteration, xsl:break and xsl:on-completion
 * (XSLT 3.0 section 7.2). The iterations run on the work stack (see
 * runtime/iteration.js); xsl:next-iteration and xsl:break record their
 * effect in the iteration state of the context, read before the next
 * item is processed.
 *
 * @module @tradik/xslt3/xslt/instructions/iterate
 */

import { compileBody } from "../compiler/body.js";
import { checkAttributes, required } from "../compiler/attributes.js";
import { isWhitespaceText, splitLeading } from "../compiler/children.js";
import { checkTailPosition } from "../compiler/tailPosition.js";
import { evaluate } from "../runtime/context.js";
import { IterateFrame } from "../runtime/iteration.js";
import { BodyFrame } from "../runtime/machine.js";
import { attr, isXsl, XSL_NS, xsltError } from "../names.js";
import { compileParams, compileWithParams } from "./params.js";

/** @type {WeakMap<Element, object[]>} the parameters of each xsl:iterate */
const iterateParams = new WeakMap();

/**
 * Compiles the select attribute or the content of xsl:break or
 * xsl:on-completion.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {import("../runtime/machine.js").Body}
 */
function compileContent(element, cx, scope) {
  const select = attr(element, "select");
  const children = cx.children(element).filter((c) => !isXsl(c, "fallback"));
  if (select === undefined) return compileBody(element, cx, scope, children);
  if (children.length > 0) {
    throw xsltError(
      "XTSE3125",
      `xsl:${element.localName} has select and content`,
    );
  }
  const expr = cx.exprs.xpath(select, element, scope.vars);
  return [
    (xc, out) => {
      for (const item of evaluate(expr, xc)) out.item(item);
    },
  ];
}

/**
 * Checks that a parameter of xsl:iterate without initial value accepts
 * the empty sequence.
 * @param {object} param
 * @throws {import("../../errors.js").XPathError} XTSE3520
 */
function checkOptional(param) {
  try {
    param.convert([]);
  } catch {
    throw xsltError(
      "XTSE3520",
      `The parameter ${param.key} of xsl:iterate needs an initial value`,
    );
  }
}

/**
 * Checks that the xsl:on-completion elements near an xsl:iterate (its
 * siblings and descendants) are children of an xsl:iterate.
 * @param {Element} element - xsl:iterate
 * @throws {import("../../errors.js").XPathError} XTSE0010
 */
function checkCompletions(element) {
  const nodes = [
    ...element.parentNode.childNodes,
    ...element.getElementsByTagNameNS(XSL_NS, "on-completion"),
  ];
  for (const node of nodes) {
    if (isXsl(node, "on-completion") && !isXsl(node.parentNode, "iterate")) {
      throw xsltError("XTSE0010", "xsl:on-completion must be in xsl:iterate");
    }
  }
}

/**
 * xsl:iterate.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileIterate(element, cx, scope) {
  const select = cx.exprs.xpath(
    required(element, "select"),
    element,
    scope.vars,
  );
  checkCompletions(element);
  const { leading, rest } = splitLeading(cx.children(element), "param");
  const { params, scope: inner } = compileParams(leading, cx, scope);
  leading.forEach((param, i) => {
    const implicit =
      attr(param, "select") === undefined && cx.children(param).length === 0;
    if (implicit && params[i].type) checkOptional(params[i]);
  });
  iterateParams.set(element, params);
  let body = rest;
  let completion = [];
  const first = rest.find((child) => !isWhitespaceText(child));
  if (first && isXsl(first, "on-completion")) {
    checkAttributes(first);
    completion = compileContent(first, cx, inner);
    body = rest.filter((child) => child !== first);
  }
  if (body.some((c) => isXsl(c, "param") || isXsl(c, "on-completion"))) {
    throw xsltError(
      "XTSE0010",
      "xsl:param, then xsl:on-completion, must come first in xsl:iterate",
    );
  }
  const steps = compileBody(element, cx, inner, body);
  return (xc, out, machine) => {
    const items = evaluate(select, xc);
    machine.push(
      new IterateFrame({ items, params, steps, completion, xc, out }),
    );
  };
}

/**
 * The innermost xsl:iterate ancestor of an element.
 * @param {Element} element
 * @returns {Element}
 */
function enclosingIterate(element) {
  let node = element.parentNode;
  while (!isXsl(node, "iterate")) node = node.parentNode;
  return node;
}

/**
 * xsl:next-iteration.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileNextIteration(element, cx, scope) {
  checkTailPosition(element, cx);
  const children = cx.children(element);
  if (!children.every((c) => isXsl(c, "with-param") || isXsl(c, "fallback"))) {
    throw xsltError("XTSE0010", "xsl:next-iteration contains xsl:with-param");
  }
  const withParams = compileWithParams(children, cx, scope);
  const declared = iterateParams.get(enclosingIterate(element));
  const keys = new Set(declared.map((param) => param.key));
  for (const name of withParams.names) {
    if (!keys.has(name)) {
      throw xsltError("XTSE3130", `xsl:iterate has no parameter ${name}`);
    }
  }
  return (xc, out, machine) => {
    const { params } = withParams.evaluate(xc, machine);
    xc.iteration.next = params;
  };
}

/**
 * xsl:break.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileBreak(element, cx, scope) {
  checkTailPosition(element, cx);
  const body = compileContent(element, cx, scope);
  return (xc, out, machine) => {
    xc.iteration.broken = true;
    if (body.length > 0) machine.push(new BodyFrame(body, xc, out));
  };
}
