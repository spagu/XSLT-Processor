/**
 * Substring matching under a collation (F&O 3.1 section 5.5): contains,
 * starts-with, ends-with, substring-before and substring-after, each with
 * an optional collation argument.
 *
 * @module @tradik/xslt3/functions/stringMatch
 */

import { collationArg, findSubstring } from "./collations.js";
import { booleanItem, define, stringArg, stringItem } from "./support.js";

/**
 * Declares a function of the family in both arities.
 * @param {string} local
 * @param {string} returns
 * @param {(text: string, search: string, collation: object) => *} match
 * @returns {import("./support.js").FunctionDefinition[]}
 */
function family(local, returns, match) {
  const impl = ([arg1, arg2, collation], context) => [
    match(stringArg(arg1), stringArg(arg2), collationArg(collation, context)),
  ];
  return [
    define(local, ["xs:string?", "xs:string?"], returns, impl),
    define(local, ["xs:string?", "xs:string?", "xs:string"], returns, impl),
  ];
}

const found = (anchor) => (text, search, collation) =>
  booleanItem(findSubstring(collation, text, search, anchor) !== null);

/** @type {import("./support.js").FunctionDefinition[]} */
export const stringMatchFunctions = [
  ...family("contains", "xs:boolean", found(null)),
  ...family("starts-with", "xs:boolean", found("start")),
  ...family("ends-with", "xs:boolean", found("end")),
  ...family("substring-before", "xs:string", (text, search, collation) => {
    const match = findSubstring(collation, text, search);
    return stringItem(match ? text.slice(0, match[0]) : "");
  }),
  ...family("substring-after", "xs:string", (text, search, collation) => {
    const match = findSubstring(collation, text, search);
    return stringItem(match ? text.slice(match[1]) : "");
  }),
];
