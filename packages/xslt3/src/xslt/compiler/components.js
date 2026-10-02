/**
 * The named components a package declares (XSLT 3.0 section 3.5.3):
 * named templates, functions, global variables and parameters,
 * attribute sets and named modes, with their visibility from the
 * visibility attribute and the xsl:expose declarations.
 *
 * @module @tradik/xslt3/xslt/compiler/components
 */

import { attr, clarkOf, isXsl, xsltError } from "../names.js";
import { required } from "./attributes.js";
import { checkUnmatched, EXPLICIT, matchesOf } from "./visibility.js";

const DECLARED = new Set(["public", "private", "final", "abstract"]);
const MODE_DECLARED = new Set(["public", "private", "final"]);

/** Declared visibilities each explicitly exposed visibility allows. */
const EXPOSABLE = {
  public: ["public"],
  private: ["public", "private", "final"],
  final: ["public", "final"],
  abstract: ["abstract"],
};

/**
 * The visibility attribute of a declaration.
 * @param {Element} element
 * @param {string} kind - Component kind
 * @returns {string|null} null when absent
 */
export function declaredVisibility(element, kind) {
  const text = attr(element, "visibility");
  if (text === undefined) return null;
  const value = text.trim();
  if (!(kind === "mode" ? MODE_DECLARED : DECLARED).has(value)) {
    throw xsltError("XTSE0020", `Invalid visibility ${text}`);
  }
  return value;
}

/**
 * The visibility of a component declared in a package.
 * @param {object} component - `{kind, uri, local, arity, declared, isParam}`
 * @param {object[]} rules - Parsed xsl:expose rules
 * @returns {string}
 */
function exposedVisibility(component, rules) {
  if (component.isParam) return "public";
  const [best] = matchesOf(rules, component);
  const { declared } = component;
  let visibility = declared ?? best?.rule.visibility ?? "private";
  if (best?.precision === EXPLICIT) {
    visibility = best.rule.visibility;
    if (declared && !EXPOSABLE[visibility].includes(declared)) {
      throw xsltError(
        "XTSE3010",
        `xsl:expose makes the ${declared} ${component.kind} ${component.local} ${visibility}`,
      );
    }
  }
  if (visibility === "abstract" && declared !== "abstract") {
    throw xsltError(
      "XTSE3025",
      `xsl:expose cannot make ${component.local} abstract`,
    );
  }
  return visibility;
}

/**
 * A component descriptor.
 * @param {string} kind
 * @param {{uri: string, local: string}} name
 * @param {Element} element - Declaration
 * @param {object} [extra] - `arity`, `isParam`
 * @returns {object}
 */
function component(kind, name, element, extra = {}) {
  const key = clarkOf(name);
  return {
    kind,
    uri: name.uri,
    local: name.local,
    arity: extra.arity ?? null,
    isParam: extra.isParam ?? false,
    key: extra.arity === undefined ? key : `${key}#${extra.arity}`,
    element,
    declared: extra.isParam ? null : declaredVisibility(element, kind),
  };
}

/**
 * The named components declared in a package (the declarations of
 * highest import precedence).
 * @param {(kind: string) => object[]} all - Declarations by kind
 * @param {object} cx - Stylesheet compiler (after compileContext)
 * @param {{signatures: Map, globals: Map}} context - From compileContext
 * @returns {object[]} components `{kind, uri, local, arity, key, element,
 *   declared, isParam}`
 */
export function declaredComponents(all, cx, { signatures, globals }) {
  const qname = (element) => cx.exprs.qname(attr(element, "name"), element);
  // the named templates of highest precedence (XTSE0660 is raised when
  // they are compiled)
  const named = (declarations) => {
    const chosen = new Map();
    for (const declaration of declarations) {
      if (attr(declaration.element, "name") === undefined) continue;
      const key = clarkOf(qname(declaration.element));
      if (!(chosen.get(key)?.precedence > declaration.precedence)) {
        chosen.set(key, declaration);
      }
    }
    return chosen;
  };
  for (const { element } of all("template")) {
    if (attr(element, "name") === undefined && attr(element, "visibility")) {
      throw xsltError("XTSE0500", "A template rule has no visibility");
    }
  }
  const list = [];
  for (const { element } of named(all("template")).values()) {
    list.push(component("template", qname(element), element));
  }
  for (const { signature } of signatures.values()) {
    const { element } = signature.declaration;
    list.push(
      component("function", signature, element, { arity: signature.arity }),
    );
  }
  for (const { element } of globals.values()) {
    const isParam = isXsl(element, "param");
    list.push(component("variable", qname(element), element, { isParam }));
  }
  // attribute sets and modes may be declared several times
  const byName = new Map();
  for (const { element } of all("attribute-set")) {
    const name = cx.exprs.qname(required(element, "name"), element);
    byName.set(`a${clarkOf(name)}`, component("attribute-set", name, element));
  }
  for (const { element } of all("mode")) {
    if (attr(element, "name") === undefined) {
      if (
        !["private", undefined].includes(attr(element, "visibility")?.trim())
      ) {
        throw xsltError("XTSE0020", "The unnamed mode is always private");
      }
      continue;
    }
    const name = qname(element);
    const mode = component("mode", name, element);
    // several xsl:mode declarations: the one with a visibility counts
    if (mode.declared || !byName.has(`m${clarkOf(name)}`)) {
      byName.set(`m${clarkOf(name)}`, mode);
    }
  }
  return [...list, ...byName.values()];
}

/**
 * Gives the declared components their visibility.
 * @param {object[]} components - From {@link declaredComponents}
 * @param {object[]} rules - Parsed xsl:expose rules
 * @param {boolean} implicit - An implicit package (xsl:stylesheet): its
 *   named templates and modes are public unless declared otherwise
 */
export function exposeComponents(components, rules, implicit) {
  for (const item of components) {
    item.visibility = exposedVisibility(item, rules);
    if (
      implicit &&
      !item.declared &&
      ["template", "mode"].includes(item.kind)
    ) {
      item.visibility = "public";
    }
  }
  checkUnmatched(rules, "XTSE3020");
}
