/**
 * xsl:accumulator declarations (XSLT 3.0 section 18.2.1): the initial
 * value, the rules (pattern, phase, new value computed with `$value`
 * bound to the old one) and the declared type; and the use-accumulators
 * attributes of xsl:mode, xsl:global-context-item, xsl:source-document
 * and xsl:merge-source (section 18.2.2).
 *
 * @module @tradik/xslt3/xslt/compiler/accumulatorDecl
 */

import { typeConverter } from "../instructions/variables.js";
import { attr, clarkOf, isXsl, xsltError } from "../names.js";
import { compilePattern } from "../patterns/compile.js";
import { evaluate } from "../runtime/context.js";
import { bodySequence } from "../runtime/values.js";
import { checkAttributes, required, yesNo } from "./attributes.js";
import { compileBody } from "./body.js";
import { declareModeAccumulators, useAccumulators } from "./useAccumulators.js";

/** Clark name of the variable of the old value in accumulator rules. */
export const VALUE_KEY = "{}value";

/**
 * Compiles a rule of an accumulator.
 * @param {Element} element - xsl:accumulator-rule
 * @param {object} cx
 * @param {(value: Array) => Array} convert
 * @returns {object} `{pattern, end, value(xc, machine)}`
 */
function compileRule(element, cx, convert) {
  checkAttributes(element);
  const phase = (attr(element, "phase") ?? "start").trim();
  if (phase !== "start" && phase !== "end") {
    throw xsltError("XTSE0020", `Invalid phase "${phase}"`);
  }
  const global = cx.globalScope();
  const scope = { ...global, vars: { key: VALUE_KEY, next: global.vars } };
  const select = attr(element, "select");
  const children = cx.children(element);
  if (select !== undefined && children.length > 0) {
    throw xsltError("XTSE0010", "xsl:accumulator-rule has select and content");
  }
  let value;
  if (select !== undefined) {
    const expr = cx.exprs.xpath(select, element, scope.vars);
    value = (xc) => convert(evaluate(expr, xc));
  } else {
    const body = compileBody(element, cx, scope, children);
    value = (xc, machine) => convert(bodySequence(body, xc, machine));
  }
  return {
    pattern: compilePattern(required(element, "match"), element, cx),
    end: phase === "end",
    value,
  };
}

/**
 * Compiles an xsl:accumulator.
 * @param {Element} element
 * @param {object} cx
 * @param {string} key - Its Clark name
 * @returns {object} the accumulator
 */
function compileAccumulator(element, cx, key) {
  yesNo(element, "streamable", false);
  const asText = attr(element, "as");
  const type =
    asText === undefined ? null : cx.exprs.sequenceType(asText, element);
  const convert = typeConverter(type, "XPTY0004", `accumulator ${key}`);
  const initial = cx.exprs.xpath(
    required(element, "initial-value"),
    element,
    cx.globalScope().vars,
  );
  const children = cx.children(element).filter((c) => !isXsl(c, "fallback"));
  if (
    children.length === 0 ||
    !children.every((child) => isXsl(child, "accumulator-rule"))
  ) {
    throw xsltError(
      "XTSE0010",
      "xsl:accumulator contains xsl:accumulator-rule elements",
    );
  }
  return {
    key,
    initial: (xc) => convert(evaluate(initial, xc)),
    rules: children.map((child) => compileRule(child, cx, convert)),
  };
}

/**
 * The declaration of each name with the highest import precedence.
 * @param {object[]} declarations - `{key, element, precedence}`
 * @returns {Map<string, object>}
 * @throws {import("../../errors.js").XPathError} XTSE3350 for two of
 *   them at that precedence
 */
function highestPrecedence(declarations) {
  const chosen = new Map();
  const duplicated = new Set();
  for (const declaration of declarations) {
    const current = chosen.get(declaration.key);
    if (current && current.precedence === declaration.precedence) {
      duplicated.add(declaration.key);
    } else if (!current || current.precedence < declaration.precedence) {
      chosen.set(declaration.key, declaration);
      duplicated.delete(declaration.key);
    }
  }
  const [duplicate] = duplicated;
  if (duplicate !== undefined) {
    throw xsltError("XTSE3350", `Two accumulators are named ${duplicate}`);
  }
  return chosen;
}

/**
 * Compiles the accumulators of a stylesheet into `cx.accumulators`, and
 * the use-accumulators attributes of its modes and global context item.
 * @param {(kind: string) => object[]} all - Declarations by kind
 * @param {object} cx
 */
export function declareAccumulators(all, cx) {
  const chosen = highestPrecedence(
    all("accumulator").map((declaration) => ({
      ...declaration,
      key: clarkOf(
        cx.exprs.qname(
          required(declaration.element, "name"),
          declaration.element,
        ),
      ),
    })),
  );
  cx.accumulators = new Map();
  for (const [key, { element }] of chosen) {
    cx.accumulators.set(key, compileAccumulator(element, cx, key));
  }
  declareModeAccumulators(all("mode"), cx);
  const contextItem = all("global-context-item")[0]?.element;
  const text = contextItem && attr(contextItem, "use-accumulators");
  cx.globalAccumulators =
    typeof text === "string" ? useAccumulators(text, contextItem, cx) : "all";
}
