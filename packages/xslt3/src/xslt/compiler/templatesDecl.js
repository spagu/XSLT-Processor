/**
 * xsl:template declarations (XSLT 3.0 section 6.1): named templates and
 * template rules, registered in their modes.
 *
 * @module @tradik/xslt3/xslt/compiler/templatesDecl
 */

import { compileParams } from "../instructions/params.js";
import { typeConverter } from "../instructions/variables.js";
import {
  attr,
  declaredName,
  isXsl,
  tokens,
  XSL_NS,
  xsltError,
} from "../names.js";
import { compilePattern } from "../patterns/compile.js";
import { splitContextItem } from "./contextItem.js";
import { compileBody } from "./body.js";
import { splitLeading } from "./children.js";
import { infoOf } from "./elementInfo.js";

/**
 * Separates the leading xsl:param children of a template or function.
 * @param {Array<object>} children
 * @returns {{params: Element[], rest: Array<object>}}
 */
export function splitParams(children) {
  const { leading, rest } = splitLeading(children, "param");
  if (rest.some((child) => isXsl(child, "param"))) {
    throw xsltError("XTSE0010", "xsl:param must come first");
  }
  return { params: leading, rest };
}

/**
 * The priority attribute of a template.
 * @param {string|undefined} text
 * @returns {number|null}
 */
function parsePriority(text) {
  if (text === undefined) return null;
  const value = text.trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(value)) {
    throw xsltError("XTSE0530", `Invalid priority "${text}"`);
  }
  return Number(value);
}

/**
 * The modes of a template rule.
 * @param {Element} element
 * @param {object} cx
 * @returns {string[]} Clark names, "#all" for all modes
 */
function modesOf(element, cx) {
  const text = attr(element, "mode");
  if (text === undefined) return [infoOf(element).defaultMode];
  const names = tokens(text).map((token) => {
    if (token === "#all") return "#all";
    if (token === "#default") return infoOf(element).defaultMode;
    if (token === "#unnamed") return "";
    const name = cx.exprs.qname(token, element, { syntaxCode: "XTSE0550" });
    return `{${name.uri}}${name.local}`;
  });
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw xsltError("XTSE0550", "Invalid mode attribute");
  }
  if (names.includes("#all") && names.length > 1) {
    throw xsltError("XTSE0550", "#all must be alone");
  }
  return names;
}

/**
 * The alternatives of a union pattern as one.
 * @param {object[]} alternatives
 * @returns {object} an alternative matching when any of them does
 */
function unionAlternative(alternatives) {
  const keys = new Set(alternatives.map((alternative) => alternative.key));
  return {
    matches: (item, xc) => alternatives.some((a) => a.matches(item, xc)),
    priority: 0.5,
    key: keys.size === 1 ? alternatives[0].key : "*",
  };
}

/**
 * Compiles an xsl:template and registers it.
 * @param {object} declaration - `{element, precedence, importLow}`
 * @param {object} cx - Stylesheet compiler
 */
export function declareTemplate(declaration, cx) {
  const { element, precedence, importLow } = declaration;
  const match = attr(element, "match");
  const nameText = attr(element, "name");
  if (match === undefined) {
    if (nameText === undefined) {
      throw xsltError("XTSE0500", "xsl:template needs match or name");
    }
    if (
      attr(element, "mode") !== undefined ||
      attr(element, "priority") !== undefined
    ) {
      throw xsltError("XTSE0500", "mode and priority need a match pattern");
    }
  }
  const contextItem = splitContextItem(cx.children(element), element, cx);
  const { params: paramElements, rest } = splitParams(contextItem.rest);
  const { params, scope } = compileParams(paramElements, cx, cx.globalScope());
  const asText = attr(element, "as");
  const template = {
    params,
    body: [...contextItem.steps, ...compileBody(element, cx, scope, rest)],
    convert: asText
      ? typeConverter(
          cx.exprs.sequenceType(asText, element),
          "XTTE0505",
          "result of the template",
        )
      : null,
    precedence,
    importLow,
    element,
  };
  if (nameText !== undefined) {
    const name = declaredName(
      cx.exprs.qname(nameText, element),
      `{${XSL_NS}}initial-template`,
    );
    cx.addNamedTemplate(`{${name.uri}}${name.local}`, template);
  }
  if (match === undefined) return;
  const pattern = compilePattern(match, element, cx);
  const explicit = parsePriority(attr(element, "priority"));
  // with a priority, a union pattern is one rule, not one per alternative
  const alternatives =
    explicit === null || pattern.alternatives.length === 1
      ? pattern.alternatives
      : [unionAlternative(pattern.alternatives)];
  for (const mode of modesOf(element, cx)) {
    for (const alternative of alternatives) {
      cx.addRule(mode, {
        template,
        alternative,
        priority: explicit ?? alternative.priority,
        precedence,
        position: cx.nextPosition(),
      });
    }
  }
}

/**
 * Builds the template of a simplified stylesheet: a rule for "/" whose
 * body is the literal result element.
 * @param {object} declaration
 * @param {object} cx
 */
export function declareSimplified(declaration, cx) {
  const { element, precedence, importLow } = declaration;
  const template = {
    params: [],
    body: compileBody(element.parentNode, cx, cx.globalScope(), [element]),
    convert: null,
    precedence,
    importLow,
    element,
  };
  const pattern = compilePattern("/", element, cx);
  cx.addRule("", {
    template,
    alternative: pattern.alternatives[0],
    priority: -0.5,
    precedence,
    position: cx.nextPosition(),
  });
}
