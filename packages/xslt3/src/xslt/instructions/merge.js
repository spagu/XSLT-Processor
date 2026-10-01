/**
 * xsl:merge, xsl:merge-source, xsl:merge-key and xsl:merge-action
 * (XSLT 3.0 section 15): the static checks and the compiled sources; the
 * merging itself is in runtime/merging.js.
 *
 * @module @tradik/xslt3/xslt/instructions/merge
 */

import { atomize, stringValue } from "../../xdm/nodes.js";
import { types } from "../../xdm/types.js";
import { resolveUri } from "../../xpath/eval/uris.js";
import { useAccumulators } from "../compiler/useAccumulators.js";
import { checkAttributes, required, yesNo } from "../compiler/attributes.js";
import { compileBody } from "../compiler/body.js";
import { setApplicable } from "../runtime/accumulators.js";
import {
  derive,
  dynamicContextOf,
  evaluate,
  withFocus,
} from "../runtime/context.js";
import { BodyFrame, LoopFrame } from "../runtime/machine.js";
import { mergeGroups } from "../runtime/merging.js";
import { attr, isNCName, isXsl, xsltError } from "../names.js";
import { compileSortKey } from "./sort.js";
import { checkNoValidation } from "./sourceDocument.js";

/** Types a URI of for-each-source may have. */
const URI_TYPES = new Set([types.string, types.anyURI, types.untypedAtomic]);

/**
 * Compiles an xsl:merge-key.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {object} the key, compiled as an xsl:sort
 */
function compileMergeKey(element, cx, scope) {
  if (!isXsl(element, "merge-key")) {
    throw xsltError("XTSE0010", "xsl:merge-source contains xsl:merge-key");
  }
  if (attr(element, "select") !== undefined && cx.children(element).length) {
    throw xsltError("XTSE3200", "xsl:merge-key has select and content");
  }
  return compileSortKey(element, cx, scope);
}

/**
 * The URIs of for-each-source as strings.
 * @param {Array} items
 * @returns {string[]}
 */
function uriStrings(items) {
  return atomize(items).map((value) => {
    if (!URI_TYPES.has(value.type)) {
      throw xsltError("XPTY0004", "for-each-source must give URIs");
    }
    return stringValue(value);
  });
}

/**
 * Compiles an xsl:merge-source.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @param {number} index - Position among the sources
 * @returns {object} `{name, keys, sortBeforeMerge, inputs(xc, machine)}`
 */
function compileMergeSource(element, cx, scope, index) {
  checkAttributes(element);
  const has = (name) => attr(element, name) !== undefined;
  const forEachSource = has("for-each-source");
  if (
    (has("for-each-item") &&
      (forEachSource || has("use-accumulators") || has("streamable"))) ||
    (has("use-accumulators") && !forEachSource)
  ) {
    throw xsltError("XTSE3195", "Conflicting attributes on xsl:merge-source");
  }
  if (!forEachSource && (has("validation") || has("type"))) {
    throw xsltError("XTSE0010", "validation and type need for-each-source");
  }
  if (has("validation") && has("type")) {
    throw xsltError("XTSE1505", "validation and type are exclusive");
  }
  checkNoValidation(element);
  yesNo(element, "streamable", false);
  const name = attr(element, "name")?.trim();
  if (name !== undefined && !isNCName(name)) {
    throw xsltError("XTSE0020", `Invalid merge source name ${name}`);
  }
  const xpath = (text) => cx.exprs.xpath(text, element, scope.vars);
  const select = xpath(required(element, "select"));
  const itemExpr = has("for-each-item")
    ? xpath(attr(element, "for-each-item"))
    : null;
  const sourceExpr = forEachSource
    ? xpath(attr(element, "for-each-source"))
    : null;
  const accumulators = useAccumulators(
    attr(element, "use-accumulators") ?? "",
    element,
    cx,
  );
  const base = cx.baseUriOf(element);
  const keys = cx
    .children(element)
    .map((child) => compileMergeKey(child, cx, scope));
  if (keys.length === 0) {
    throw xsltError("XTSE0010", "xsl:merge-source needs xsl:merge-key");
  }
  const documents = (xc) =>
    uriStrings(evaluate(sourceExpr, xc)).map((uri) => {
      const document = dynamicContextOf(xc).loadDocument(resolveUri(uri, base));
      setApplicable(xc.tx, document, accumulators);
      return document;
    });
  return {
    name: name ?? `#${index}`,
    named: name !== undefined,
    keys,
    sortBeforeMerge: yesNo(element, "sort-before-merge", false),
    inputs(xc) {
      let anchors = null;
      if (itemExpr) anchors = evaluate(itemExpr, xc);
      else if (sourceExpr) anchors = documents(xc);
      if (!anchors) return [evaluate(select, xc)];
      return anchors.map((anchor, i) =>
        evaluate(select, withFocus(xc, anchor, i + 1, anchors.length)),
      );
    },
  };
}

/**
 * xsl:merge.
 * @param {Element} element
 * @param {object} cx
 * @param {object} scope
 * @returns {Function}
 */
export function compileMerge(element, cx, scope) {
  const children = cx.children(element);
  while (children.length > 0 && isXsl(children.at(-1), "fallback")) {
    children.pop();
  }
  const action = children.at(-1);
  const sourceElements = children.slice(0, -1);
  if (
    !action ||
    !isXsl(action, "merge-action") ||
    sourceElements.length === 0 ||
    !sourceElements.every((child) => isXsl(child, "merge-source"))
  ) {
    throw xsltError(
      "XTSE0010",
      "xsl:merge contains xsl:merge-source elements then xsl:merge-action",
    );
  }
  const sources = sourceElements.map((child, i) =>
    compileMergeSource(child, cx, scope, i),
  );
  const names = sources.filter((s) => s.named).map((s) => s.name);
  if (new Set(names).size !== names.length) {
    throw xsltError("XTSE3190", "Two merge sources have the same name");
  }
  if (sources.some((source) => source.keys.length !== sources[0].keys.length)) {
    throw xsltError("XTSE2200", "The merge sources have different key counts");
  }
  checkAttributes(action);
  const body = compileBody(action, cx, scope);
  return (xc, out, machine) => {
    const groups = mergeGroups(sources, xc, machine);
    const size = groups.length;
    if (size === 0 || body.length === 0) return;
    machine.push(
      new LoopFrame(size, (i) => {
        const group = groups[i];
        const context = derive(
          withFocus(xc, group.entries[0].item, i + 1, size),
          {
            merge: { group, names },
          },
        );
        machine.push(new BodyFrame(body, context, out));
      }),
    );
  };
}
