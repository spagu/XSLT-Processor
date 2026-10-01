/**
 * Compatible signatures of an overriding and an overridden component
 * (XSLT 3.0 section 3.5.3.3, XTSE3070): identical declared types of
 * functions, variables and templates, and the template parameters an
 * overriding template must keep.
 *
 * @module @tradik/xslt3/xslt/compiler/compatibility
 */

import { attr, clarkOf, isXsl, xsltError } from "../names.js";
import { yesNo } from "./attributes.js";
import { infoOf } from "./elementInfo.js";

const QNAME = /([\p{L}_][\p{L}\p{N}_.-]*):([\p{L}_][\p{L}\p{N}_.-]*)/gu;

/**
 * A declared type in a form that compares equal for identical types
 * written with different prefixes or spacing.
 * @param {Element} element - Declaration with the `as` attribute
 * @returns {string}
 */
function typeOf(element) {
  const namespaces = infoOf(element).namespaces;
  return (attr(element, "as") ?? "item()*")
    .replace(/\s+/g, "")
    .replace(QNAME, (name, prefix, local) =>
      namespaces.has(prefix) ? `Q{${namespaces.get(prefix)}}${local}` : name,
    );
}

/**
 * The xsl:param children of a template or function.
 * @param {Element} element
 * @param {object} cx
 * @returns {Array<{key: string, type: string, required: boolean, tunnel:
 *   boolean}>}
 */
function paramsOf(element, cx) {
  return cx
    .children(element)
    .filter((child) => isXsl(child, "param"))
    .map((param) => ({
      key: clarkOf(cx.exprs.qname(attr(param, "name"), param)),
      type: typeOf(param),
      required: yesNo(param, "required", false),
      tunnel: yesNo(param, "tunnel", false),
    }));
}

/**
 * The xsl:context-item declaration of a template, as `use|type`.
 * @param {Element} element
 * @param {object} cx
 * @returns {string}
 */
function contextItemOf(element, cx) {
  const item = cx.children(element).find((c) => isXsl(c, "context-item"));
  if (!item) return "optional|item()";
  const type = attr(item, "as") === undefined ? "item()" : typeOf(item);
  return `${attr(item, "use")?.trim() ?? "optional"}|${type}`;
}

/**
 * Whether an overriding template keeps the interface of the overridden
 * one.
 * @param {Element} overriding
 * @param {Element} overridden
 * @param {object} cx
 * @returns {boolean}
 */
function templatesCompatible(overriding, overridden, cx) {
  const mine = new Map(paramsOf(overriding, cx).map((p) => [p.key, p]));
  const theirs = paramsOf(overridden, cx);
  for (const param of theirs) {
    const other = mine.get(param.key);
    if (param.tunnel) {
      if (other && (!other.tunnel || other.type !== param.type)) return false;
    } else if (
      !other ||
      other.tunnel ||
      other.type !== param.type ||
      other.required !== param.required
    ) {
      return false;
    }
  }
  const known = new Set(theirs.map((p) => p.key));
  return (
    contextItemOf(overriding, cx) === contextItemOf(overridden, cx) &&
    [...mine.values()].every((p) => known.has(p.key) || !p.required)
  );
}

/**
 * @param {Element} element - xsl:function
 * @returns {string} its new-each-time value
 */
const newEachTime = (element) =>
  ({ true: "yes", 1: "yes", false: "no", 0: "no" })[
    attr(element, "new-each-time")?.trim()
  ] ??
  attr(element, "new-each-time")?.trim() ??
  "maybe";

/**
 * XTSE3070: checks that an overriding declaration is compatible with the
 * component it overrides.
 * @param {Element} overriding
 * @param {object} component - The overridden component (`kind`, `element`)
 * @param {object} cx - The using package's compiler
 */
export function checkCompatible(overriding, component, cx) {
  const overridden = component.element;
  let compatible = typeOf(overriding) === typeOf(overridden);
  if (component.kind === "function") {
    const mine = paramsOf(overriding, cx).map((p) => p.type);
    const theirs = paramsOf(overridden, cx).map((p) => p.type);
    compatible &&=
      mine.every((type, i) => type === theirs[i]) &&
      newEachTime(overriding) === newEachTime(overridden);
  } else if (component.kind === "template") {
    compatible &&= templatesCompatible(overriding, overridden, cx);
  }
  if (!compatible) {
    throw xsltError(
      "XTSE3070",
      `The override of ${component.local} is incompatible`,
    );
  }
}
