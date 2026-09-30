/**
 * EXSLT strings module (http://exslt.org/strings), following libexslt
 * `strings.c`: tokenize, split, replace, padding, align, concat, encode-uri
 * and decode-uri.
 *
 * `tokenize()` / `split()` return `token` elements (no namespace) and
 * `replace()` returns one text node; like libexslt's result tree fragments,
 * the nodes of one call are siblings in a new DocumentFragment.
 */

"use strict";

import { expandedFunctionName } from "../../xpath/evaluator.js";
import {
  EXSLT_STRINGS,
  checkArity,
  createContainer,
  isNodeSetValue,
  toNodeSet,
} from "./arguments.js";
import {
  DEFAULT_TOKENIZE_DELIMITERS,
  alignString,
  paddingString,
  replaceStrings,
  splitString,
  tokenizeString,
} from "./stringOps.js";
import { decodeUri, encodeUri } from "./uri.js";

/**
 * Build the EXSLT strings functions.
 *
 * @param {import('../../xpath/evaluator.js').XPathEvaluator} evaluator - Evaluates the arguments
 * @returns {Object<string, Function>} Functions keyed by expanded name
 */
export function createStringsFunctions(evaluator) {
  const value = (arg, ctx) => evaluator.evaluate(arg, ctx);
  const string = (arg, ctx) => evaluator.toString(value(arg, ctx));
  const optionalString = (args, index, ctx, fallback) =>
    args.length > index ? string(args[index], ctx) : fallback;

  /**
   * Turn tokens into `token` elements of a new fragment.
   *
   * @param {string[]} tokens - The tokens
   * @param {object} ctx - Evaluation context, provides the owner document
   * @returns {Element[]} The token elements
   */
  const tokenElements = (tokens, ctx) => {
    const container = createContainer(ctx);
    const doc = container.ownerDocument;
    return tokens.map((token) => {
      const element = doc.createElementNS(null, "token");
      element.appendChild(doc.createTextNode(token));
      return container.appendChild(element);
    });
  };

  /**
   * String values of a node-set argument, or the string of any other value.
   *
   * @param {*} argValue - An evaluated argument
   * @returns {string[]} The strings
   */
  const stringList = (argValue) =>
    isNodeSetValue(argValue)
      ? toNodeSet("str:replace", argValue).map((node) =>
          evaluator.getStringValue(node),
        )
      : [evaluator.toString(argValue)];

  const key = (local) => expandedFunctionName(EXSLT_STRINGS, local);

  return {
    [key("tokenize")]: (args, ctx) => {
      checkArity("str:tokenize", args, 1, 2);
      const delimiters = optionalString(
        args,
        1,
        ctx,
        DEFAULT_TOKENIZE_DELIMITERS,
      );
      return tokenElements(
        tokenizeString(string(args[0], ctx), delimiters),
        ctx,
      );
    },

    [key("split")]: (args, ctx) => {
      checkArity("str:split", args, 1, 2);
      const delimiter = optionalString(args, 1, ctx, " ");
      return tokenElements(splitString(string(args[0], ctx), delimiter), ctx);
    },

    [key("replace")]: (args, ctx) => {
      checkArity("str:replace", args, 3);
      const str = string(args[0], ctx);
      const searches = stringList(value(args[1], ctx));
      const replacements = stringList(value(args[2], ctx));
      const container = createContainer(ctx);
      const text = container.ownerDocument.createTextNode(
        replaceStrings(str, searches, replacements),
      );
      return [container.appendChild(text)];
    },

    [key("padding")]: (args, ctx) => {
      checkArity("str:padding", args, 1, 2);
      const length = evaluator.toNumber(value(args[0], ctx));
      return paddingString(length, optionalString(args, 1, ctx, ""));
    },

    [key("align")]: (args, ctx) => {
      checkArity("str:align", args, 2, 3);
      return alignString(
        string(args[0], ctx),
        string(args[1], ctx),
        optionalString(args, 2, ctx, null),
      );
    },

    [key("concat")]: (args, ctx) => {
      checkArity("str:concat", args, 1);
      return toNodeSet("str:concat", value(args[0], ctx))
        .map((node) => evaluator.getStringValue(node))
        .join("");
    },

    [key("encode-uri")]: (args, ctx) => {
      checkArity("str:encode-uri", args, 2, 3);
      return encodeUri(
        string(args[0], ctx),
        evaluator.toBoolean(value(args[1], ctx)),
        optionalString(args, 2, ctx, undefined),
      );
    },

    [key("decode-uri")]: (args, ctx) => {
      checkArity("str:decode-uri", args, 1, 2);
      return decodeUri(
        string(args[0], ctx),
        optionalString(args, 1, ctx, undefined),
      );
    },
  };
}
