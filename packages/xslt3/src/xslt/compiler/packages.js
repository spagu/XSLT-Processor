/**
 * xsl:use-package (XSLT 3.0 section 3.5.2): the used package located
 * through the `resolvePackage` option and compiled for this use, and the
 * components it offers accepted (xsl:accept) or overridden
 * (xsl:override) by the using package (section 3.5.3.2).
 *
 * @module @tradik/xslt3/xslt/compiler/packages
 */

import { attr, isXsl, xsltError } from "../names.js";
import { acceptComponents, matchOverrides } from "./acceptance.js";
import { checkAttributes, required } from "./attributes.js";
import { parseVersionRange, versionMatches } from "./packageVersions.js";
import { checkUnmatched, parseVisibilityRules } from "./visibility.js";

const ACCEPT_VALUES = new Set([
  "public",
  "private",
  "final",
  "abstract",
  "hidden",
]);
const OVERRIDABLE = new Set([
  "template",
  "function",
  "variable",
  "param",
  "attribute-set",
]);

/**
 * Locates and prepares the package of an xsl:use-package declaration.
 * @param {Element} element
 * @param {object} cx - The using package's compiler
 * @returns {object} the prepared compiler of the used package
 */
function locatePackage(element, cx) {
  const name = required(element, "name").trim();
  const range = attr(element, "package-version");
  parseVersionRange(range);
  if (cx.packageChain.includes(name)) {
    throw xsltError("XTSE3005", `The package ${name} depends on itself`);
  }
  const found = cx.options.resolvePackage?.(name, range?.trim() ?? "*");
  if (!found) throw xsltError("XTSE3000", `No package ${name} ${range ?? ""}`);
  const { source, baseUri } =
    typeof found === "object" && "source" in found ? found : { source: found };
  const child = cx.usedPackage([...cx.packageChain, name]);
  const document =
    typeof source === "string" ? cx.options.parse(source, baseUri) : source;
  child.prepare(document, baseUri ?? (document.documentURI || undefined));
  // a package without a name takes the one it was found by
  const named = child.packageName ?? name;
  if (named !== name || !versionMatches(child.packageVersion, range)) {
    throw xsltError("XTSE3000", `No package ${name} ${range ?? ""}`);
  }
  return child;
}

/**
 * The xsl:accept rules and overriding declarations of an xsl:use-package.
 * @param {Element} element
 * @param {object} cx
 * @returns {{rules: object[], overrides: Element[]}}
 */
function useContent(element, cx) {
  const accepts = [];
  const overrides = [];
  for (const child of cx.children(element)) {
    if (isXsl(child, "accept")) {
      checkAttributes(child);
      accepts.push(child);
    } else if (isXsl(child, "override")) {
      checkAttributes(child);
      for (const declaration of cx.children(child)) {
        if (
          declaration.nodeType !== 1 ||
          !OVERRIDABLE.has(declaration.localName) ||
          !isXsl(declaration)
        ) {
          throw xsltError(
            "XTSE0010",
            "xsl:override holds only overridable declarations",
          );
        }
        overrides.push(declaration);
      }
    } else {
      throw xsltError(
        "XTSE0010",
        "xsl:use-package holds xsl:accept and xsl:override",
      );
    }
  }
  const rules = parseVisibilityRules(accepts, cx, {
    allowed: ACCEPT_VALUES,
    anyCode: "XTSE3032",
  });
  return { rules, overrides };
}

/**
 * Resolves an xsl:use-package declaration: prepares the used package and
 * decides the visibility of each of its components in this package.
 * @param {object} declaration - `{element, imported}`
 * @param {object} cx - The using package's compiler
 * @returns {object} `{element, child, accepted, overrides}`: accepted
 *   components `{component, visibility, override}` (hidden ones left
 *   out), overriding declarations `{element, symbol, component}`
 */
export function usePackage(declaration, cx) {
  const { element } = declaration;
  if (declaration.imported) {
    throw xsltError(
      "XTSE3008",
      "xsl:use-package cannot be in an imported module",
    );
  }
  checkAttributes(element);
  const child = locatePackage(element, cx);
  const { rules, overrides } = useContent(element, cx);
  const byKey = new Map(child.exports.map((c) => [`${c.kind} ${c.key}`, c]));
  const { list, overridden } = matchOverrides(overrides, rules, byKey, cx);
  const accepted = acceptComponents(
    child.exports,
    overridden,
    rules,
    cx.header.implicit,
  );
  checkUnmatched(rules, "XTSE3030");
  return {
    element,
    child,
    accepted,
    overrides: list,
    precedence: declaration.precedence,
  };
}
