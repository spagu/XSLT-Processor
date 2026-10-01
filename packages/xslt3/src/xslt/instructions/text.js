/**
 * Instructions that produce text and leaf nodes: xsl:value-of, xsl:text,
 * xsl:sequence, xsl:comment, xsl:processing-instruction and xsl:namespace
 * (XSLT 3.0 sections 11.4 to 11.7 and 11.9).
 *
 * @module @tradik/xslt3/xslt/instructions/text
 */

import { compileBody } from "../compiler/body.js";
import { required } from "../compiler/attributes.js";
import { evaluate } from "../runtime/context.js";
import { avtEvaluator } from "../runtime/values.js";
import { attr, isNCName, isXsl, xsltError } from "../names.js";
import { compileSimpleContent } from "./elements.js";

/**
 * xsl:value-of.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileValueOf(element, cx, scope) {
  const value = compileSimpleContent(element, cx, scope, "", "XTSE0870");
  if (
    attr(element, "select") === undefined &&
    cx.children(element).length === 0
  ) {
    if (cx.versionOf(element) < 3) {
      throw xsltError("XTSE0870", "xsl:value-of needs select or content");
    }
  }
  return (xc, out, machine) => out.text(value(xc, machine));
}

/**
 * xsl:text.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileText(element, cx, scope) {
  for (const child of cx.children(element)) {
    if (child.nodeType === 1) {
      throw xsltError("XTSE0010", "xsl:text cannot contain elements");
    }
  }
  // an empty xsl:text makes a zero-length text node
  return compileBody(element, cx, scope)[0] ?? ((xc, out) => out.text(""));
}

/**
 * xsl:sequence.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileSequence(element, cx, scope) {
  const select = attr(element, "select");
  const children = cx.children(element);
  const body = compileBody(
    element,
    cx,
    scope,
    children.filter((child) => !isXsl(child, "fallback")),
  );
  if (select === undefined) {
    if (cx.versionOf(element) < 3) {
      throw xsltError("XTSE0010", "xsl:sequence requires select");
    }
    return (xc, out, machine) => machine.runBody(body, xc, out);
  }
  if (body.length > 0) {
    throw xsltError("XTSE3185", "xsl:sequence cannot have select and content");
  }
  const expr = cx.exprs.xpath(select, element, scope.vars);
  return (xc, out) => {
    for (const item of evaluate(expr, xc)) out.item(item);
  };
}

/**
 * xsl:comment.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileComment(element, cx, scope) {
  const value = compileSimpleContent(element, cx, scope, " ", "XTSE0940");
  return (xc, out, machine) => {
    let text = value(xc, machine).replace(/--/g, "- -");
    text = text.replace(/--/g, "- -");
    if (text.endsWith("-")) text += " ";
    out.comment(text);
  };
}

/**
 * xsl:processing-instruction.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileProcessingInstruction(element, cx, scope) {
  const name = avtEvaluator(
    cx.exprs.avt(required(element, "name"), element, scope.vars),
  );
  const value = compileSimpleContent(element, cx, scope, " ", "XTSE0880");
  return (xc, out, machine) => {
    const target = name(xc).trim();
    if (!isNCName(target) || target.toLowerCase() === "xml") {
      throw xsltError(
        "XTDE0890",
        `Invalid processing instruction name ${target}`,
      );
    }
    let data = value(xc, machine).replace(/^[ \t\r\n]+/, "");
    data = data.replace(/\?>/g, "? >");
    out.pi(target, data);
  };
}

/**
 * xsl:namespace.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileNamespace(element, cx, scope) {
  const name = avtEvaluator(
    cx.exprs.avt(required(element, "name"), element, scope.vars),
  );
  const value = compileSimpleContent(element, cx, scope, " ", "XTSE0910");
  return (xc, out, machine) => {
    const prefix = name(xc).trim();
    if (prefix !== "" && !isNCName(prefix)) {
      throw xsltError("XTDE0920", `Invalid namespace prefix ${prefix}`);
    }
    if (prefix === "xmlns") {
      throw xsltError("XTDE0920", "The prefix xmlns cannot be bound");
    }
    const uri = value(xc, machine);
    const xml = "http://www.w3.org/XML/1998/namespace";
    if ((prefix === "xml") !== (uri === xml)) {
      throw xsltError("XTDE0925", "The xml prefix and namespace go together");
    }
    if (uri === "http://www.w3.org/2000/xmlns/") {
      throw xsltError("XTDE0905", "The xmlns namespace cannot be bound");
    }
    if (uri === "") {
      throw xsltError("XTDE0930", "A namespace node cannot have an empty URI");
    }
    if (prefix === "xml") return;
    out.namespace(prefix, uri);
  };
}
