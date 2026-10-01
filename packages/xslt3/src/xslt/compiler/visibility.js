/**
 * xsl:expose and xsl:accept (XSLT 3.0 sections 3.5.3.1 and 3.5.3.2): the
 * rules that give components their visibility, chosen by how precisely
 * a token of `names` matches a component (an explicit name beats a
 * namespace or local-name wildcard, which beats `*`; the last such rule
 * in document order wins).
 *
 * @module @tradik/xslt3/xslt/compiler/visibility
 */

import { attr, resolveQName, tokens, xsltError } from "../names.js";
import { required } from "./attributes.js";
import { infoOf } from "./elementInfo.js";

/** Component kinds that xsl:expose and xsl:accept name. */
const KINDS = new Set([
  "template",
  "function",
  "attribute-set",
  "variable",
  "mode",
]);

/** How precisely a token matches: higher wins. */
export const EXPLICIT = 3;
const PARTIAL = 2;
const ANY = 1;

/**
 * Parses a token of a names attribute.
 * @param {string} token
 * @param {Element} element
 * @returns {object} `{precision, uri, local, arity}` (null for wildcards)
 */
function parseToken(token, element) {
  const namespaces = infoOf(element).namespaces;
  if (token === "*") return { precision: ANY };
  if (token.startsWith("*:")) {
    return { precision: PARTIAL, uri: null, local: token.slice(2) };
  }
  const eqWildcard = /^Q\{([^{}]*)\}\*$/.exec(token);
  if (eqWildcard) {
    return { precision: PARTIAL, uri: eqWildcard[1], local: null };
  }
  if (token.endsWith(":*")) {
    const { uri } = resolveQName(`${token.slice(0, -2)}:x`, namespaces, {
      code: "XTSE0020",
    });
    return { precision: PARTIAL, uri, local: null };
  }
  const hash = token.lastIndexOf("#");
  const arity = hash < 0 ? null : token.slice(hash + 1);
  if (arity !== null && !/^\d+$/.test(arity)) {
    throw xsltError("XTSE0020", `Invalid name ${token}`);
  }
  const name = resolveQName(
    hash < 0 ? token : token.slice(0, hash),
    namespaces,
    { code: "XTSE0020" },
  );
  return {
    precision: EXPLICIT,
    uri: name.uri,
    local: name.local,
    arity: arity === null ? null : Number(arity),
  };
}

/**
 * Parses xsl:expose or xsl:accept elements.
 * @param {Element[]} elements - In document order
 * @param {object} cx - Stylesheet compiler
 * @param {object} options
 * @param {Set<string>} options.allowed - Allowed visibility values
 * @param {string} options.anyCode - Error of component="*" with a
 *   non-wildcard name (XTSE3022, XTSE3032)
 * @returns {object[]} rules `{kind, visibility, tokens, element}`
 */
export function parseVisibilityRules(elements, cx, { allowed, anyCode }) {
  return elements.map((element) => {
    if (cx.children(element).length > 0) {
      throw xsltError("XTSE0260", `xsl:${element.localName} must be empty`);
    }
    const kind = required(element, "component").trim();
    if (kind !== "*" && !KINDS.has(kind)) {
      throw xsltError("XTSE0020", `Invalid component ${kind}`);
    }
    const visibility = required(element, "visibility").trim();
    if (!allowed.has(visibility)) {
      throw xsltError("XTSE0020", `Invalid visibility ${visibility}`);
    }
    const parsed = tokens(required(element, "names")).map((token) =>
      parseToken(token, element),
    );
    if (kind === "*" && parsed.some((t) => t.precision === EXPLICIT)) {
      throw xsltError(anyCode, 'component="*" needs wildcard names');
    }
    return { kind, visibility, tokens: parsed, element };
  });
}

/**
 * How precisely a token matches a component.
 * @param {object} token
 * @param {object} component - `{kind, uri, local, arity}`
 * @returns {number} 0 when it does not match
 */
function tokenMatch(token, component) {
  if (token.precision === ANY) return ANY;
  if (token.precision === PARTIAL) {
    const matches =
      token.uri === null
        ? token.local === component.local
        : token.uri === component.uri;
    return matches ? PARTIAL : 0;
  }
  if (token.uri !== component.uri || token.local !== component.local) return 0;
  if (token.arity !== null && component.kind !== "function") return 0;
  // a function is named with its arity
  if (component.kind === "function") {
    return token.arity === component.arity ? EXPLICIT : 0;
  }
  return EXPLICIT;
}

/**
 * The matches of the rules for a component, best first.
 * @param {object[]} rules
 * @param {object} component
 * @returns {Array<{rule: object, token: object, precision: number}>}
 */
export function matchesOf(rules, component) {
  const found = [];
  rules.forEach((rule, order) => {
    if (rule.kind !== "*" && rule.kind !== component.kind) return;
    for (const token of rule.tokens) {
      const precision = tokenMatch(token, component);
      if (precision > 0) {
        token.used = true;
        found.push({ rule, token, precision, order });
      }
    }
  });
  return found.sort((a, b) => b.precision - a.precision || b.order - a.order);
}

/**
 * Checks that every explicit token matched a component.
 * @param {object[]} rules
 * @param {string} code - XTSE3020 (expose) or XTSE3030 (accept)
 */
export function checkUnmatched(rules, code) {
  for (const rule of rules) {
    for (const token of rule.tokens) {
      if (token.precision === EXPLICIT && !token.used) {
        throw xsltError(code, `${attr(rule.element, "names")} matches nothing`);
      }
    }
  }
}
