/**
 * xsl:number (XSLT 3.0 section 12): numbers from the value attribute or
 * the position of a node, formatted with a format string of
 * alphanumeric tokens and separators.
 *
 * @module @tradik/xslt3/xslt/instructions/number
 */

import { isNode } from "../../xdm/atomic.js";
import { canonicalString } from "../../xdm/lexical.js";
import { toNumber } from "../../xdm/generalCompare.js";
import { atomize } from "../../xdm/nodes.js";
import { infoOf } from "../compiler/elementInfo.js";
import { evaluate } from "../runtime/context.js";
import {
  countKey,
  numberAny,
  numberHierarchy,
  numberMemo,
  sameKindAndName,
} from "../runtime/numbering.js";
import { formatNumbers } from "../runtime/numberFormat.js";
import { avtEvaluator } from "../runtime/values.js";
import { attr, xsltError } from "../names.js";
import { compilePattern, patternMatches } from "../patterns/compile.js";

/**
 * Converts the value attribute's result to integers.
 * @param {Array} values
 * @param {boolean} compatible
 * @returns {bigint[]|string} integers, or a string for invalid numbers
 *   in backwards-compatible mode
 */
function integersOf(values, compatible) {
  const result = [];
  const items = atomize(values);
  // XSLT 1.0 behaviour: number(()) is NaN
  if (compatible && items.length === 0) return "NaN";
  // XSLT 1.0 behaviour: the first item only
  for (const value of compatible ? items.slice(0, 1) : items) {
    if (typeof value.value === "bigint" && value.value >= 0n) {
      result.push(value.value);
      continue;
    }
    const n = toNumber(value).value;
    if (!Number.isFinite(n) || n < -0.5) {
      if (compatible) return canonicalString(toNumber(value));
      throw xsltError("XTDE0980", `Cannot number ${canonicalString(value)}`);
    }
    result.push(BigInt(Math.round(n)));
  }
  return result;
}

/**
 * Checks a lang value: a language tag (xs:language).
 * @param {string} text
 * @param {string} code - XTSE0020 when static, XTDE0030 when evaluated
 */
function checkLanguage(text, code) {
  if (!/^\s*[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*\s*$/.test(text)) {
    throw xsltError(code, `Invalid lang "${text}"`);
  }
}

/**
 * Re-bases the numbers by the start-at attribute (XSLT 3.0 section 12.1).
 * @param {bigint[]} numbers
 * @param {string} text - Effective value of start-at
 * @returns {bigint[]}
 * @throws {import("../../errors.js").XPathError} XTDE0030 for a value
 *   that is not a list of integers
 */
function rebase(numbers, text) {
  if (!/^\s*-?\d+(\s+-?\d+)*\s*$/.test(text)) {
    throw xsltError("XTDE0030", `Invalid start-at "${text}"`);
  }
  const starts = text.trim().split(/\s+/).map(BigInt);
  return numbers.map(
    (number, i) => number + starts[Math.min(i, starts.length - 1)] - 1n,
  );
}

/**
 * Compiles an optional pattern attribute.
 * @returns {object|null}
 */
function optionalPattern(element, name, cx, scope) {
  const text = attr(element, name);
  return text === undefined
    ? null
    : compilePattern(text, element, cx, scope.vars);
}

/**
 * Whether the numbers an instruction gives may be memoized: its count
 * and from patterns must not read variables (local ones differ between
 * invocations) or the dynamic context of the instruction.
 * @param {Element} element
 * @returns {boolean}
 */
function isMemoizable(element) {
  const text = `${attr(element, "count") ?? ""} ${attr(element, "from") ?? ""}`;
  return !/\$|current-|regex-group/.test(text);
}

/**
 * xsl:number.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileNumber(element, cx, scope) {
  const expr = (name) => {
    const text = attr(element, name);
    return text === undefined
      ? null
      : cx.exprs.xpath(text, element, scope.vars);
  };
  const avt = (name, fallback) => {
    const text = attr(element, name);
    return text === undefined
      ? () => fallback
      : avtEvaluator(cx.exprs.avt(text, element, scope.vars));
  };
  const value = expr("value");
  const select = expr("select");
  const level = attr(element, "level")?.trim() ?? "single";
  if (!["single", "multiple", "any"].includes(level)) {
    throw xsltError("XTSE0020", `Invalid level ${level}`);
  }
  const count = optionalPattern(element, "count", cx, scope);
  const from = optionalPattern(element, "from", cx, scope);
  if (value && (select || count || from || attr(element, "level"))) {
    throw xsltError(
      "XTSE0975",
      "xsl:number value excludes select, level, count, from",
    );
  }
  const format = avt("format", "1");
  const ordinal = avt("ordinal", "");
  const separator = avt("grouping-separator", "");
  const size = avt("grouping-size", "");
  const compatible = infoOf(element).version < 2;
  const startAt =
    attr(element, "start-at") === undefined ? null : avt("start-at");
  const langText = attr(element, "lang");
  if (langText !== undefined && !langText.includes("{")) {
    checkLanguage(langText, "XTSE0020");
  }
  const lang = langText === undefined ? null : avt("lang");
  // identity of the instruction for the memos of each transformation
  const instruction = {};
  const memoizable = isMemoizable(element);
  return (xc, out) => {
    let numbers;
    if (value) {
      numbers = integersOf(evaluate(value, xc), compatible);
      if (typeof numbers === "string") {
        out.text(numbers);
        return;
      }
    } else {
      const nodes = select ? evaluate(select, xc) : [xc.item];
      if (nodes.length !== 1 || !isNode(nodes[0])) {
        throw xsltError(
          select ? "XTTE1000" : "XTTE0990",
          "xsl:number needs one node to number",
        );
      }
      const node = nodes[0];
      const countTest = count
        ? (n) => patternMatches(count, n, xc)
        : sameKindAndName(node);
      const fromTest = from ? (n) => patternMatches(from, n, xc) : null;
      const memo = memoizable
        ? numberMemo(xc.tx, instruction, count ? "" : countKey(node))
        : null;
      const places =
        level === "any"
          ? numberAny(node, countTest, fromTest, memo)
          : numberHierarchy(
              node,
              countTest,
              fromTest,
              level === "multiple",
              memo,
            );
      numbers = places.map(BigInt);
    }
    if (startAt) numbers = rebase(numbers, startAt(xc));
    const language = lang ? lang(xc) : null;
    if (language !== null) checkLanguage(language, "XTDE0030");
    const ordinalText = ordinal(xc).trim();
    out.text(
      formatNumbers(numbers, format(xc), {
        ordinal: ordinalText !== "" && ordinalText !== "no" && ordinalText,
        lang: language,
        separator: separator(xc),
        size: Number(size(xc)),
      }),
    );
  };
}
