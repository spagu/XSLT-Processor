/**
 * xsl:evaluate (XSLT 3.0 section 10.4): compiles the string of the xpath
 * attribute and evaluates it with the parameters of the xsl:with-param
 * children and of the with-params map, and the context item of the
 * context-item attribute. The transform() option `dynamicEvaluation:
 * false` disables it: then the xsl:fallback children run, or XTDE3175 is
 * raised.
 *
 * @module @tradik/xslt3/xslt/instructions/evaluate
 */

import { isMap, isNode } from "../../xdm/atomic.js";
import { types } from "../../xdm/types.js";
import { resolveUri } from "../../xpath/eval/uris.js";
import { compileFallback } from "../compiler/body.js";
import { required } from "../compiler/attributes.js";
import { infoOf } from "../compiler/elementInfo.js";
import { derive, dynamicContextOf, evaluate } from "../runtime/context.js";
import { compileTarget, nodeNamespaces } from "../runtime/dynamicXPath.js";
import { avtEvaluator } from "../runtime/values.js";
import { attr, isXsl, xsltError } from "../names.js";
import { compileWithParams } from "./params.js";
import { typeConverter } from "./variables.js";

/**
 * The variables given by the with-params map.
 * @param {Array} value
 * @returns {Map<string, Array>} values by Clark name
 * @throws {import("../../errors.js").XPathError} XTTE3165
 */
function mapParams(value) {
  const map = value[0];
  if (value.length !== 1 || !isMap(map)) {
    throw xsltError("XTTE3165", "with-params must be a single map");
  }
  const params = new Map();
  for (const { key, value: item } of map.entries.values()) {
    if (key.type !== types.QName) {
      throw xsltError("XTTE3165", "The keys of with-params must be QNames");
    }
    params.set(`{${key.value.namespaceURI}}${key.value.localName}`, item);
  }
  return params;
}

/**
 * The values of the xsl:with-param children; a value that does not
 * match its declared type is a type error of the target (XPTY0004).
 * @param {object} params - Compiled xsl:with-param children
 * @param {object} xc
 * @param {object} machine
 * @returns {Map<string, Array>}
 */
function withParamValues(params, xc, machine) {
  try {
    return params.evaluate(xc, machine).params;
  } catch (error) {
    if (error.code !== "XTTE0570") throw error;
    throw xsltError("XPTY0004", error.message.replace(/^[A-Z]+\d+: /, ""));
  }
}

/**
 * The boolean value of schema-aware.
 * @param {string} text
 * @returns {boolean}
 * @throws {import("../../errors.js").XPathError} XTDE0030 for another value
 */
function schemaAware(text) {
  const value = text.trim();
  if (["yes", "true", "1"].includes(value)) return true;
  if (["no", "false", "0"].includes(value)) return false;
  throw xsltError("XTDE0030", `Invalid schema-aware value "${text}"`);
}

/**
 * xsl:evaluate.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileEvaluate(element, cx, scope) {
  const children = cx.children(element);
  if (!children.every((c) => isXsl(c, "with-param") || isXsl(c, "fallback"))) {
    throw xsltError("XTSE0010", "xsl:evaluate contains xsl:with-param");
  }
  const xpath = (name) => {
    const text = attr(element, name);
    return text === undefined
      ? null
      : cx.exprs.xpath(text, element, scope.vars);
  };
  const target = cx.exprs.xpath(
    required(element, "xpath"),
    element,
    scope.vars,
  );
  const toString = typeConverter(
    cx.exprs.sequenceType("xs:string", element),
    "XPTY0004",
    "xpath attribute of xsl:evaluate",
  );
  const contextItem = xpath("context-item");
  const withParamsMap = xpath("with-params");
  const namespaceContext = xpath("namespace-context");
  const avt = (name) => {
    const text = attr(element, name);
    return text === undefined
      ? null
      : avtEvaluator(cx.exprs.avt(text, element, scope.vars));
  };
  const baseUri = avt("base-uri");
  const schema = avt("schema-aware");
  const asText = attr(element, "as");
  const convert = typeConverter(
    asText === undefined ? null : cx.exprs.sequenceType(asText, element),
    "XPTY0004",
    "result of xsl:evaluate",
  );
  const params = compileWithParams(children, cx, scope);
  const fallback = children.some((c) => isXsl(c, "fallback"))
    ? compileFallback(element, cx, scope)
    : null;
  const info = infoOf(element);
  const staticPart = {
    namespaces: new Map([...info.namespaces].filter(([p]) => p !== "")),
    defaultElementNamespace: info.xpathDefaultNs,
    baseUri: info.baseUri,
    library: cx.exprs.library,
    decimalFormats: cx.exprs.decimalFormats,
  };
  const cache = new Map();
  return (xc, out, machine) => {
    if (!xc.tx.dynamicEvaluation) {
      if (fallback) return fallback(xc, out, machine);
      throw xsltError("XTDE3175", "xsl:evaluate is disabled");
    }
    const text = toString(evaluate(target, xc))[0].value;
    if (schema) schemaAware(schema(xc));
    const values = withParamValues(params, xc, machine);
    if (withParamsMap) {
      for (const [key, value] of mapParams(evaluate(withParamsMap, xc))) {
        values.set(key, value);
      }
    }
    const context = { ...staticPart };
    if (namespaceContext) {
      const nodes = evaluate(namespaceContext, xc);
      if (nodes.length !== 1 || !isNode(nodes[0])) {
        throw xsltError("XTTE3170", "namespace-context must be a single node");
      }
      Object.assign(context, nodeNamespaces(nodes[0]));
    }
    if (baseUri) context.baseUri = resolveUri(baseUri(xc), info.baseUri);
    const keys = [...values.keys()];
    const cacheKey = `${text}\u0000${keys.join(" ")}`;
    let run = namespaceContext || baseUri ? null : cache.get(cacheKey);
    if (!run) {
      run = compileTarget(text, context, keys);
      if (!namespaceContext && !baseUri) cache.set(cacheKey, run);
    }
    const focus = contextItem ? evaluate(contextItem, xc) : [];
    if (focus.length > 1) {
      throw xsltError("XTTE3210", "context-item must be at most one item");
    }
    let env = null;
    for (const key of keys) env = { value: values.get(key), next: env };
    const targetXc = derive(xc, {
      group: undefined,
      groupKey: undefined,
      regex: undefined,
      merge: undefined,
    });
    const dyn = dynamicContextOf(targetXc);
    dyn.sc = run.sc;
    dyn.staticBaseUri = run.sc.baseUri;
    dyn.decimalFormats = run.sc.decimalFormats;
    if (info.defaultCollation) dyn.defaultCollation = info.defaultCollation;
    const result = run({
      item: focus[0],
      position: focus.length,
      size: focus.length,
      env,
      dyn,
    });
    for (const item of convert(result)) out.item(item);
  };
}
