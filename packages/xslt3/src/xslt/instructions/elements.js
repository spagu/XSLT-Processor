/**
 * xsl:element and xsl:attribute (XSLT 3.0 sections 11.2 and 11.3):
 * nodes with computed names.
 *
 * @module @tradik/xslt3/xslt/instructions/elements
 */

import { compileBody } from "../compiler/body.js";
import { required } from "../compiler/attributes.js";
import { infoOf } from "../compiler/elementInfo.js";
import { evaluate } from "../runtime/context.js";
import { markConstructed } from "../runtime/baseUri.js";
import { BodyFrame } from "../runtime/machine.js";
import {
  avtEvaluator,
  bodySequence,
  simpleContent,
} from "../runtime/values.js";
import { attr, isQName, XML_NS, XMLNS_NS, xsltError } from "../names.js";
import { applyAttributeSets, attributeSetNames } from "./attributeSets.js";

/**
 * Compiles the computed name of an element or attribute.
 * @param {Element} element - The instruction
 * @param {object} cx
 * @param {object} scope
 * @param {object} codes - Error codes: `name` (invalid QName), `prefix`
 *   (undeclared prefix), `namespace` (reserved namespace)
 * @param {boolean} useDefault - Unprefixed names take the default namespace
 * @returns {(xc: object) => {uri: string, qname: string, prefix: string, local: string}}
 */
function compileName(element, cx, scope, codes, useDefault) {
  const name = avtEvaluator(
    cx.exprs.avt(required(element, "name"), element, scope.vars),
  );
  const nsText = attr(element, "namespace");
  const namespace =
    nsText === undefined
      ? null
      : avtEvaluator(cx.exprs.avt(nsText, element, scope.vars));
  const namespaces = infoOf(element).namespaces;
  return (xc) => {
    const qname = name(xc).trim();
    if (!isQName(qname)) {
      throw xsltError(codes.name, `Invalid name "${qname}"`);
    }
    const colon = qname.indexOf(":");
    const prefix = colon < 0 ? "" : qname.slice(0, colon);
    const local = qname.slice(colon + 1);
    let uri;
    if (namespace) uri = namespace(xc);
    else if (prefix === "xml") uri = XML_NS;
    else if (prefix) {
      uri = namespaces.get(prefix);
      if (!uri) throw xsltError(codes.prefix, `Undeclared prefix ${prefix}`);
    } else uri = useDefault ? (namespaces.get("") ?? "") : "";
    if (uri === XMLNS_NS || (uri !== XML_NS && prefix === "xml")) {
      throw xsltError(codes.namespace, `The namespace ${uri} is reserved`);
    }
    if (uri === "") return { uri, qname: local, prefix: "", local };
    return { uri, qname, prefix, local };
  };
}

/**
 * xsl:element.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileElement(element, cx, scope) {
  const name = compileName(
    element,
    cx,
    scope,
    { name: "XTDE0820", prefix: "XTDE0830", namespace: "XTDE0835" },
    true,
  );
  const sets = attributeSetNames(
    attr(element, "use-attribute-sets"),
    element,
    cx,
  );
  const body = compileBody(element, cx, scope);
  const base = infoOf(element).baseUri;
  return (xc, out, machine) => {
    const { uri, qname } = name(xc);
    const content = out.element(uri, qname);
    markConstructed(content, base);
    if (sets.length > 0) applyAttributeSets(sets, xc, content, machine, cx);
    if (body.length > 0) machine.push(new BodyFrame(body, xc, content));
  };
}

/**
 * The value of an instruction with simple content: its select
 * expression or its content, joined with a separator.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @param {string} contentSeparator - Default separator for content
 * @param {string} conflictCode - Error code for select and content
 * @returns {(xc: object, machine: object) => string}
 */
export function compileSimpleContent(
  element,
  cx,
  scope,
  contentSeparator,
  conflictCode,
) {
  const select = attr(element, "select");
  const body = compileBody(element, cx, scope);
  if (select !== undefined && body.length > 0) {
    throw xsltError(
      conflictCode,
      `xsl:${element.localName} cannot have both select and content`,
    );
  }
  const separatorText = attr(element, "separator");
  const separator =
    separatorText === undefined
      ? () => (select === undefined ? contentSeparator : " ")
      : avtEvaluator(cx.exprs.avt(separatorText, element, scope.vars));
  if (select === undefined) {
    return (xc, machine) =>
      simpleContent(bodySequence(body, xc, machine, false), separator(xc));
  }
  const expr = cx.exprs.xpath(select, element, scope.vars);
  if (infoOf(element).version < 2 && separatorText === undefined) {
    return (xc) => simpleContent(evaluate(expr, xc).slice(0, 1), "");
  }
  return (xc) => simpleContent(evaluate(expr, xc), separator(xc));
}

/**
 * xsl:attribute.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileAttribute(element, cx, scope) {
  const name = compileName(
    element,
    cx,
    scope,
    { name: "XTDE0850", prefix: "XTDE0860", namespace: "XTDE0865" },
    false,
  );
  const value = compileSimpleContent(element, cx, scope, "", "XTSE0840");
  return (xc, out, machine) => {
    const { uri, qname, prefix, local } = name(xc);
    if (qname === "xmlns" || (uri === "" && local === "xmlns")) {
      throw xsltError("XTDE0855", "An attribute cannot be named xmlns");
    }
    const actual = prefix === "xmlns" ? local : qname;
    out.attribute(uri, actual, value(xc, machine));
  };
}
