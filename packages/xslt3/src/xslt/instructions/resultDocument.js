/**
 * xsl:result-document (XSLT 3.0 section 25.1): a new result tree, with
 * the serialization parameters of an output definition overridden by
 * the instruction's own attributes (attribute value templates); a raw
 * sequence when build-tree is "no" (see runtime/rawResults.js).
 *
 * @module @tradik/xslt3/xslt/instructions/resultDocument
 */

import { resolveUri } from "../../xpath/eval/uris.js";
import { compileBody } from "../compiler/body.js";
import { infoOf } from "../compiler/elementInfo.js";
import {
  expandCharacterMaps,
  readParameterDocument,
} from "../compiler/outputDecl.js";
import { derive } from "../runtime/context.js";
import { resultReceiver } from "../runtime/rawResults.js";
import { avtEvaluator } from "../runtime/values.js";
import { attr, clarkOf, resolveQName, tokens, xsltError } from "../names.js";

/** Serialization parameters given as attributes. */
const PARAMETERS = [
  "allow-duplicate-names",
  "build-tree",
  "byte-order-mark",
  "doctype-public",
  "doctype-system",
  "encoding",
  "escape-uri-attributes",
  "html-version",
  "include-content-type",
  "indent",
  "item-separator",
  "json-node-output-method",
  "media-type",
  "method",
  "normalization-form",
  "omit-xml-declaration",
  "standalone",
  "undeclare-prefixes",
  "output-version",
];

/** Parameters whose value is a list of element names. */
const NAME_LISTS = ["cdata-section-elements", "suppress-indentation"];

/**
 * Compiles the serialization attributes.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {(xc: object) => object} the parameters they set
 */
function compileParameters(element, cx, scope) {
  const namespaces = infoOf(element).namespaces;
  const compiled = [...PARAMETERS, ...NAME_LISTS]
    .filter((name) => attr(element, name) !== undefined)
    .map((name) => [
      name,
      avtEvaluator(cx.exprs.avt(attr(element, name), element, scope.vars)),
    ]);
  const mapNames = tokens(attr(element, "use-character-maps")).map((token) =>
    clarkOf(cx.exprs.qname(token, element)),
  );
  const characterMaps =
    mapNames.length > 0
      ? expandCharacterMaps(mapNames, cx.characterMaps)
      : null;
  const clark = (text, useDefault) =>
    clarkOf(resolveQName(text, namespaces, { useDefault, code: "XTDE1460" }));
  const documentText = attr(element, "parameter-document");
  const document =
    documentText === undefined
      ? null
      : avtEvaluator(cx.exprs.avt(documentText, element, scope.vars));
  return (xc) => {
    // the attributes override the parameter document
    const params = document
      ? readParameterDocument(document(xc), element, cx)
      : {};
    for (const [name, value] of compiled) {
      const text = value(xc).trim();
      if (NAME_LISTS.includes(name)) {
        params[name] = tokens(text).map((token) => clark(token, true));
      } else if (name === "method" && text.includes(":")) {
        params[name] = clark(text, false);
      } else params[name] = name === "item-separator" ? value(xc) : text;
    }
    if (characterMaps) params["use-character-maps"] = characterMaps;
    return params;
  };
}

/**
 * xsl:result-document.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileResultDocument(element, cx, scope) {
  const avt = (name) => {
    const text = attr(element, name);
    return text === undefined
      ? null
      : avtEvaluator(cx.exprs.avt(text, element, scope.vars));
  };
  const href = avt("href");
  const format = avt("format");
  const parameters = compileParameters(element, cx, scope);
  const body = compileBody(element, cx, scope);
  return (xc, out, machine) => {
    const { tx } = xc;
    if (xc.temporary) {
      throw xsltError("XTDE1480", "xsl:result-document in a temporary tree");
    }
    const target = href ? href(xc) : "";
    const uri = target === "" ? "" : resolveUri(target, tx.baseOutputUri);
    if (tx.resultUris.has(uri)) {
      throw xsltError(
        "XTDE1490",
        `Two results have the URI ${uri || "(principal)"}`,
      );
    }
    tx.resultUris.add(uri);
    const output = {
      ...cx.outputFor(format ? format(xc) : null, element),
      ...parameters(xc),
    };
    // "#absent" (XSLT 3.0 section 26.1): no item separator, overriding
    // the one of the output definition
    if (output["item-separator"] === "#absent") delete output["item-separator"];
    const { receiver, value } = resultReceiver(
      output,
      tx.scratch,
      tx.options.buildTree,
    );
    const context = derive(xc, { outputUri: uri || tx.baseOutputUri });
    machine.runBody(body, context, receiver);
    tx.addResult(uri, value(), output);
  };
}
