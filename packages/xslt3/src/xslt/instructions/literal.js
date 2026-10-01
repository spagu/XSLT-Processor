/**
 * Literal result elements (XSLT 3.0 section 11.1): the element is copied
 * with its namespace nodes (less the XSLT namespace and the excluded
 * ones, with namespace aliases applied) and its attributes, whose values
 * are attribute value templates; its content is a sequence constructor.
 *
 * @module @tradik/xslt3/xslt/instructions/literal
 */

import { compileBody } from "../compiler/body.js";
import { infoOf } from "../compiler/elementInfo.js";
import { isNamespaceDeclaration } from "../../xpath/eval/domNodes.js";
import { BodyFrame } from "../runtime/machine.js";
import { avtEvaluator } from "../runtime/values.js";
import { XSL_NS, xslAttr, xsltError } from "../names.js";
import { attributeSetNames, applyAttributeSets } from "./attributeSets.js";

/** Attributes in the XSLT namespace allowed on literal result elements. */
const LRE_ATTRIBUTES = new Set([
  "version",
  "exclude-result-prefixes",
  "extension-element-prefixes",
  "xpath-default-namespace",
  "default-collation",
  "default-mode",
  "default-validation",
  "expand-text",
  "use-attribute-sets",
  "use-when",
  "type",
  "validation",
  "inherit-namespaces",
]);

/**
 * The result name of a stylesheet name after namespace aliasing.
 * @param {string} uri
 * @param {string} prefix
 * @param {string} local
 * @param {Map<string, {uri: string, prefix: string}>} aliases
 * @returns {{uri: string, qname: string}}
 */
export function aliasedName(uri, prefix, local, aliases) {
  const alias = aliases.get(uri);
  if (!alias) return { uri, qname: prefix ? `${prefix}:${local}` : local };
  const resultPrefix = alias.uri === "" ? "" : alias.prefix;
  return {
    uri: alias.uri,
    qname: resultPrefix ? `${resultPrefix}:${local}` : local,
  };
}

/**
 * The namespace nodes a literal result element copies.
 * @param {Element} element
 * @param {Map<string, object>} aliases
 * @returns {Array<[string, string]>} prefix, URI pairs
 */
function copiedNamespaces(element, aliases) {
  const info = infoOf(element);
  const result = [];
  for (const [prefix, uri] of info.namespaces) {
    if (prefix === "xml" || uri === XSL_NS) continue;
    if (aliases.has(uri) || info.excluded.has(uri)) continue;
    if (uri === "" && prefix !== "") continue;
    result.push([prefix, uri]);
  }
  return result;
}

/**
 * Compiles a literal result element.
 * @param {Element} element
 * @param {object} cx - Stylesheet compiler
 * @param {import("../compiler/body.js").Scope} scope
 * @returns {Function} the step
 */
export function compileLiteralElement(element, cx, scope) {
  const { uri, qname } = aliasedName(
    element.namespaceURI ?? "",
    element.prefix ?? "",
    element.localName,
    cx.aliases,
  );
  const namespaces = copiedNamespaces(element, cx.aliases);
  const compatible = infoOf(element).version < 2;
  const attributes = [];
  const forwards = infoOf(element).version > 3;
  for (const attribute of element.attributes) {
    if (isNamespaceDeclaration(attribute)) continue;
    if (attribute.namespaceURI === XSL_NS) {
      if (!forwards && !LRE_ATTRIBUTES.has(attribute.localName)) {
        throw xsltError(
          "XTSE0805",
          `Unknown attribute ${attribute.name} on a literal result element`,
        );
      }
      continue;
    }
    const name = aliasedName(
      attribute.namespaceURI ?? "",
      attribute.prefix ?? "",
      attribute.localName,
      cx.aliases,
    );
    const parts = cx.exprs.avt(attribute.value, element, scope.vars);
    attributes.push({ ...name, value: avtEvaluator(parts, compatible) });
  }
  const sets = attributeSetNames(
    xslAttr(element, "use-attribute-sets"),
    element,
    cx,
  );
  const body = compileBody(element, cx, scope);
  return (xc, out, machine) => {
    const content = out.element(uri, qname);
    for (const [prefix, namespace] of namespaces) {
      content.declareExplicit(prefix, namespace);
    }
    if (sets.length > 0) applyAttributeSets(sets, xc, content, machine, cx);
    for (const attribute of attributes) {
      content.attribute(attribute.uri, attribute.qname, attribute.value(xc));
    }
    if (body.length > 0) machine.push(new BodyFrame(body, xc, content));
  };
}
