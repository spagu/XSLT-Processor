/**
 * The use-accumulators attributes (XSLT 3.0 section 18.2.2) of xsl:mode,
 * xsl:global-context-item, xsl:source-document and xsl:merge-source: the
 * accumulators that apply to a tree.
 *
 * @module @tradik/xslt3/xslt/compiler/useAccumulators
 */

import { attr, clarkOf, tokens, xsltError } from "../names.js";

/**
 * The use-accumulators attributes of the xsl:mode declarations: the one
 * of the highest import precedence wins.
 * @param {object[]} declarations
 * @param {object} cx
 * @throws {import("../../errors.js").XPathError} XTSE0545 for different
 *   values at the same precedence
 */
export function declareModeAccumulators(declarations, cx) {
  const chosen = new Map();
  for (const { element, precedence } of declarations) {
    const text = attr(element, "use-accumulators");
    if (text === undefined) continue;
    const nameText = attr(element, "name");
    const name =
      nameText === undefined || nameText.trim() === "#unnamed"
        ? ""
        : clarkOf(cx.exprs.qname(nameText, element));
    const accumulators = useAccumulators(text, element, cx);
    const key =
      accumulators === "all" ? "#all" : [...accumulators].sort().join();
    const current = chosen.get(name);
    if (current?.precedence === precedence && current.key !== key) {
      current.conflict = true;
    } else if (!current || current.precedence < precedence) {
      chosen.set(name, { precedence, key, accumulators, conflict: false });
    }
  }
  for (const [name, { accumulators, conflict }] of chosen) {
    if (conflict) {
      throw xsltError("XTSE0545", "Conflicting use-accumulators for a mode");
    }
    cx.mode(name).accumulators = accumulators;
  }
}

/**
 * Parses a use-accumulators attribute.
 * @param {string} text
 * @param {Element} element
 * @param {object} cx
 * @returns {Set<string>|"all"} Clark names of the accumulators, or all
 * @throws {import("../../errors.js").XPathError} XTSE3300
 */
export function useAccumulators(text, element, cx) {
  const names = tokens(text);
  if (names.includes("#all")) {
    if (names.length > 1) {
      throw xsltError("XTSE3300", "#all must be alone in use-accumulators");
    }
    return "all";
  }
  const keys = new Set();
  for (const token of names) {
    const name = cx.exprs.qname(token, element, { code: "XTSE3300" });
    const key = clarkOf(name);
    if (keys.has(key) || !cx.accumulators.has(key)) {
      throw xsltError("XTSE3300", `Invalid accumulator ${token}`);
    }
    keys.add(key);
  }
  return keys;
}
