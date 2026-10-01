/**
 * fn:concat, fn:string-join and fn:string-length (F&O 3.1 5.4.1 to 5.4.4).
 *
 * The evaluator's core library may define these functions itself; this
 * array exists so they are available either way. Register it only for the
 * names the core library leaves out, to avoid duplicate definitions.
 *
 * @module @tradik/xslt3/functions/stringsCore
 */

import { canonicalString } from "../xdm/lexical.js";
import {
  contextString,
  define,
  integerItem,
  stringArg,
  stringItem,
} from "./support.js";

/** @param {Array<*>} sequence @returns {string} "" or the canonical string */
const optionalString = (sequence) =>
  sequence.length === 0 ? "" : canonicalString(sequence[0]);

/** @param {string} s @returns {number} length in codepoints */
const codepointLength = (s) => {
  let length = 0;
  for (const _char of s) length++;
  return length;
};

/**
 * fn:string-join.
 * @param {Array<*>[]} args - [$arg1, $arg2?]
 * @returns {Array<*>}
 */
const stringJoin = ([items, separator = []]) => [
  stringItem(items.map(canonicalString).join(stringArg(separator))),
];

/** @type {import("./support.js").FunctionDefinition[]} */
export const coreStringFunctions = [
  define(
    "concat",
    ["xs:anyAtomicType?", "xs:anyAtomicType?"],
    "xs:string",
    (args) => [stringItem(args.map(optionalString).join(""))],
    { variadic: true },
  ),
  define("string-join", ["xs:anyAtomicType*"], "xs:string", stringJoin),
  define(
    "string-join",
    ["xs:anyAtomicType*", "xs:string"],
    "xs:string",
    stringJoin,
  ),
  define(
    "string-length",
    [],
    "xs:integer",
    (_args, context) => [integerItem(codepointLength(contextString(context)))],
    { focus: true },
  ),
  define("string-length", ["xs:string?"], "xs:integer", ([s]) => [
    integerItem(codepointLength(stringArg(s))),
  ]),
];
