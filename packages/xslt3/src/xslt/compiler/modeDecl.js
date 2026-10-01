/**
 * xsl:mode declarations (XSLT 3.0 section 6.7.1): the behaviour of a
 * mode for unmatched and ambiguously matched items, several declarations
 * of a mode combined (XTSE0545 for a conflict at the same import
 * precedence).
 *
 * @module @tradik/xslt3/xslt/compiler/modeDecl
 */

import { attr, clarkOf, xsltError } from "../names.js";

const ON_NO_MATCH = new Set([
  "deep-copy",
  "shallow-copy",
  "deep-skip",
  "shallow-skip",
  "text-only-copy",
  "fail",
]);

/**
 * Records the attributes of an xsl:mode declaration, noting two values
 * of an attribute at the same import precedence (XTSE0545 unless a
 * declaration of higher precedence settles it).
 * @param {object} mode
 * @param {Element} element
 * @param {number} precedence
 */
function recordModeAttributes(mode, element, precedence) {
  mode.declared ??= new Map();
  for (const attribute of element.attributes) {
    const key = attribute.name;
    // use-accumulators is compared as a set (useAccumulators.js)
    if (
      key === "name" ||
      key === "use-accumulators" ||
      key.includes(":") ||
      key.startsWith("xmlns")
    ) {
      continue;
    }
    const value = attribute.value.trim();
    const previous = mode.declared.get(key);
    const conflict =
      previous?.precedence === precedence &&
      (previous.conflict || previous.value !== value);
    mode.declared.set(key, { value, precedence, conflict });
  }
}

/**
 * XTSE0545: checks the xsl:mode declarations once all are recorded.
 * @param {Iterable<object>} modes
 */
export function checkModeDeclarations(modes) {
  for (const mode of modes) {
    for (const [key, { conflict }] of mode.declared ?? []) {
      if (conflict) {
        throw xsltError("XTSE0545", `Conflicting values of ${key} for a mode`);
      }
    }
  }
}

/**
 * Applies an xsl:mode declaration.
 * @param {object} declaration
 * @param {object} cx
 */
export function declareMode({ element, precedence }, cx) {
  if (cx.children(element).length > 0) {
    throw xsltError("XTSE0010", "xsl:mode must be empty");
  }
  const nameText = attr(element, "name");
  const name =
    nameText === undefined ? "" : clarkOf(cx.exprs.qname(nameText, element));
  const mode = cx.mode(name);
  recordModeAttributes(mode, element, precedence);
  const onNoMatch = attr(element, "on-no-match");
  if (onNoMatch !== undefined) {
    if (!ON_NO_MATCH.has(onNoMatch.trim())) {
      throw xsltError("XTSE0020", `Invalid on-no-match ${onNoMatch}`);
    }
    mode.onNoMatch = onNoMatch.trim();
  }
  const onMultiple = attr(element, "on-multiple-match");
  if (onMultiple !== undefined) mode.onMultipleMatch = onMultiple.trim();
}
