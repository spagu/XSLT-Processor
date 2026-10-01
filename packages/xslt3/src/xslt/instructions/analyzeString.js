/**
 * xsl:analyze-string (XSLT 3.0 section 17.1): the matching and
 * non-matching substrings of a string, each processed with the substring
 * as context item; regex-group() gives the captured groups.
 *
 * @module @tradik/xslt3/xslt/instructions/analyzeString
 */

import { allMatches, compileRegex } from "../../functions/regex/compile.js";
import { stringItem } from "../../xpath/eval/atomics.js";
import { atomize } from "../../xdm/nodes.js";
import { canonicalString } from "../../xdm/lexical.js";
import { compileBody } from "../compiler/body.js";
import { checkAttributes, required } from "../compiler/attributes.js";
import { derive, evaluate } from "../runtime/context.js";
import { BodyFrame, LoopFrame } from "../runtime/machine.js";
import { avtEvaluator } from "../runtime/values.js";
import { attr, isXsl, xsltError } from "../names.js";

/** Types accepted as the string of xsl:analyze-string. */
const STRING_LIKE = new Set(["string", "untypedAtomic", "anyURI"]);

/**
 * Compiles the regular expression, mapping its errors to XSLT codes.
 * @param {string} regex
 * @param {string} flags
 * @returns {object}
 */
function regexOf(regex, flags) {
  let compiled;
  try {
    compiled = compileRegex(regex, flags);
  } catch (error) {
    const code = error.code === "FORX0001" ? "XTDE1145" : "XTDE1140";
    throw xsltError(code, error.message);
  }
  compiled.regex.lastIndex = 0;
  if (compiled.regex.test("")) {
    throw xsltError("XTDE1150", 'The regular expression matches ""');
  }
  return compiled;
}

/**
 * Splits a string into matching and non-matching substrings.
 * @param {string} input
 * @param {object} compiled
 * @returns {Array<{text: string, groups: string[]|null}>}
 */
function segmentsOf(input, compiled) {
  const segments = [];
  let last = 0;
  for (const match of allMatches(compiled, input)) {
    if (match.index > last) {
      segments.push({ text: input.slice(last, match.index), groups: null });
    }
    const groups = [];
    for (let i = 0; i <= compiled.groups; i++) groups.push(match[i] ?? "");
    segments.push({ text: match[0], groups });
    last = match.index + match[0].length;
  }
  if (last < input.length) {
    segments.push({ text: input.slice(last), groups: null });
  }
  return segments;
}

/**
 * xsl:analyze-string.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileAnalyzeString(element, cx, scope) {
  const select = cx.exprs.xpath(
    required(element, "select"),
    element,
    scope.vars,
  );
  const regex = avtEvaluator(
    cx.exprs.avt(required(element, "regex"), element, scope.vars),
  );
  const flagsText = attr(element, "flags");
  const flags = flagsText
    ? avtEvaluator(cx.exprs.avt(flagsText, element, scope.vars))
    : () => "";
  let matching = null;
  let nonMatching = null;
  for (const child of cx.children(element)) {
    if (isXsl(child, "matching-substring") && !matching && !nonMatching) {
      checkAttributes(child);
      matching = compileBody(child, cx, scope);
    } else if (isXsl(child, "non-matching-substring") && !nonMatching) {
      checkAttributes(child);
      nonMatching = compileBody(child, cx, scope);
    } else if (!isXsl(child, "fallback")) {
      throw xsltError("XTSE0010", "Invalid content of xsl:analyze-string");
    }
  }
  if (!matching && !nonMatching) {
    throw xsltError("XTSE1130", "xsl:analyze-string needs a substring child");
  }
  return (xc, out, machine) => {
    const values = atomize(evaluate(select, xc));
    if (values.length > 1) {
      throw xsltError("XPTY0004", "xsl:analyze-string selects one string");
    }
    const primitive = values[0]?.type.primitive.localName;
    if (values.length && !STRING_LIKE.has(primitive)) {
      throw xsltError("XPTY0004", "xsl:analyze-string selects a string");
    }
    const input = values.length ? canonicalString(values[0]) : "";
    const compiled = regexOf(regex(xc), flags(xc));
    const segments = segmentsOf(input, compiled);
    const size = segments.length;
    if (size === 0) return;
    const base = derive(xc, { rule: null });
    machine.push(
      new LoopFrame(size, (i) => {
        const { text, groups } = segments[i];
        const body = groups ? matching : nonMatching;
        if (!body || body.length === 0) return;
        const context = derive(base, {
          item: stringItem(text),
          position: i + 1,
          size,
          regex: groups ?? undefined,
        });
        machine.push(new BodyFrame(body, context, out));
      }),
    );
  };
}
