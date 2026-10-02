/**
 * The components of a used package seen from the using package (XSLT 3.0
 * sections 3.5.3.2 and 3.5.3.3): the overriding declarations matched to
 * the components they override, and the visibility of every other
 * component after xsl:accept.
 *
 * @module @tradik/xslt3/xslt/compiler/acceptance
 */

import { attr, clarkOf, isXsl, tokens, xsltError } from "../names.js";
import { checkCompatible } from "./compatibility.js";
import { declaredVisibility } from "./components.js";
import { infoOf } from "./elementInfo.js";
import { splitParams } from "./templatesDecl.js";
import { EXPLICIT, matchesOf } from "./visibility.js";

/** Errors of two overriding declarations of the same component. */
const DUPLICATE = {
  template: "XTSE0660",
  function: "XTSE0770",
  variable: "XTSE0630",
  "attribute-set": "XTSE3055",
};

/** Visibilities in the used package that each xsl:accept value allows. */
const ACCEPTABLE = {
  public: ["public"],
  private: ["public", "final"],
  final: ["public", "final"],
  abstract: ["abstract"],
  hidden: ["public", "final", "abstract"],
};

/**
 * The visibility in the using package of a component that is not
 * overridden (Visibility of Components in Used and Using Packages).
 * @param {object} component - Exported by the used package
 * @param {object[]} rules - Parsed xsl:accept rules
 * @returns {string}
 */
function acceptedVisibility(component, rules) {
  if (component.isParam) return "public";
  for (const { rule, precision } of matchesOf(rules, component)) {
    if (ACCEPTABLE[rule.visibility].includes(component.visibility)) {
      return rule.visibility;
    }
    if (precision === EXPLICIT) {
      throw xsltError(
        "XTSE3040",
        `${component.local} cannot be accepted as ${rule.visibility}`,
      );
    }
  }
  return ["public", "final"].includes(component.visibility)
    ? "private"
    : "hidden";
}

/**
 * The component an overriding declaration names.
 * @param {Element} element - Child of xsl:override
 * @param {object} cx
 * @returns {object|null} `{kind, uri, local, arity, key}`, null for a
 *   template rule without a name
 */
function overrideSymbol(element, cx) {
  const name = attr(element, "name");
  if (name === undefined) return null;
  const qname = cx.exprs.qname(name, element);
  const kind = element.localName === "param" ? "variable" : element.localName;
  const key = `{${qname.uri}}${qname.local}`;
  if (kind !== "function") return { kind, ...qname, arity: null, key };
  const arity = splitParams(cx.children(element)).params.length;
  return { kind, ...qname, arity, key: `${key}#${arity}` };
}

/**
 * Checks that the modes of an overriding template rule are public modes
 * of the used package (XTSE3440 for the unnamed mode, XTSE3060).
 * @param {Element} element - xsl:template with a match pattern
 * @param {Map<string, object>} byKey - Exported components
 * @param {object} cx
 */
function checkRuleModes(element, byKey, cx) {
  const text = attr(element, "mode");
  const { defaultMode } = infoOf(element);
  const keys =
    text === undefined
      ? [defaultMode]
      : tokens(text).map((token) => {
          if (token === "#default") return defaultMode;
          return token.startsWith("#")
            ? ""
            : clarkOf(cx.exprs.qname(token, element));
        });
  for (const key of keys) {
    if (key === "") {
      throw xsltError("XTSE3440", "An overriding template rule needs a mode");
    }
    if (byKey.get(`mode ${key}`)?.visibility !== "public") {
      throw xsltError("XTSE3060", `No template rules can be added to ${key}`);
    }
  }
}

/**
 * Matches the overriding declarations of an xsl:use-package with the
 * components they override.
 * @param {Element[]} overrides - Children of xsl:override
 * @param {object[]} rules - Parsed xsl:accept rules
 * @param {Map<string, object>} byKey - Exported components by "kind key"
 * @param {object} cx - The using package's compiler
 * @returns {{list: object[], overridden: Map<object, Element>}} the
 *   declarations `{element, symbol, component}` and the overridden
 *   components
 */
export function matchOverrides(overrides, rules, byKey, cx) {
  const overridden = new Map();
  const list = [];
  for (const element of overrides) {
    const symbol = overrideSymbol(element, cx);
    if (attr(element, "match") !== undefined) {
      checkRuleModes(element, byKey, cx);
    }
    if (!symbol) {
      list.push({ element, symbol: null, component: null });
      continue;
    }
    const component = byKey.get(`${symbol.kind} ${symbol.key}`);
    if (!component) {
      throw xsltError("XTSE3058", `${symbol.local} overrides nothing`);
    }
    if (!["public", "abstract"].includes(component.visibility)) {
      throw xsltError("XTSE3060", `${symbol.local} cannot be overridden`);
    }
    if (matchesOf(rules, symbol).some((m) => m.precision === EXPLICIT)) {
      throw xsltError("XTSE3051", `${symbol.local} is accepted and overridden`);
    }
    if (overridden.has(component)) {
      throw xsltError(DUPLICATE[symbol.kind], `${symbol.local} twice`);
    }
    checkCompatible(element, component, cx);
    overridden.set(component, element);
    list.push({ element, symbol, component });
  }
  return { list, overridden };
}

/**
 * The components of the used package with their visibility in the using
 * package, hidden ones left out.
 * @param {object[]} exported - Components exported by the used package
 * @param {Map<object, Element>} overridden - From {@link matchOverrides}
 * @param {object[]} rules - Parsed xsl:accept rules
 * @param {boolean} [implicit] - The using package is an implicit one (an
 *   xsl:stylesheet), whose templates and modes are public by default
 * @returns {object[]} `{component, visibility, override}`
 */
export function acceptComponents(exported, overridden, rules, implicit) {
  const accepted = [];
  for (const component of exported) {
    const element = overridden.get(component);
    let visibility;
    if (!element) visibility = acceptedVisibility(component, rules);
    else if (isXsl(element, "param")) visibility = "public";
    else {
      const fallback =
        implicit && ["template", "mode"].includes(component.kind)
          ? "public"
          : "private";
      visibility = declaredVisibility(element, component.kind) ?? fallback;
    }
    if (visibility !== "hidden") {
      accepted.push({ component, visibility, override: element ?? null });
    }
  }
  return accepted;
}
