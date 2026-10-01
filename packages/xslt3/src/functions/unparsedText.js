/**
 * fn:unparsed-text, fn:unparsed-text-lines and fn:unparsed-text-available
 * (F&O 3.1 section 14.6), through the dynamic context hook `loadText`
 * (see xpath/eval/resources.js for the loader and its default).
 *
 * @module @tradik/xslt3/functions/unparsedText
 */

import { booleanItem, define, stringItem } from "./support.js";

/**
 * Lines of a text: split at CRLF, CR or LF; a final line ending does not
 * start an empty line.
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  if (text === "") return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Declares a function of the family in its two arities.
 * @param {string} local
 * @param {string} returns
 * @param {(load: () => string) => Array} impl - Gets the loading of the
 *   resource, not called for an empty href
 * @param {Array} empty - Result for an empty href
 * @returns {object[]}
 */
function family(local, returns, impl, empty) {
  const run = ([href, encoding], context) =>
    href.length
      ? impl(() => context.loadText(href[0].value, encoding?.[0].value))
      : empty;
  return [
    define(local, ["xs:string?"], returns, run),
    define(local, ["xs:string?", "xs:string"], returns, run),
  ];
}

/**
 * fn:unparsed-text-available: whether loading succeeds (every error of
 * the loading is a FOUT error).
 * @param {() => string} load
 * @returns {Array}
 */
function available(load) {
  try {
    load();
    return [booleanItem(true)];
  } catch {
    return [booleanItem(false)];
  }
}

/** Function definitions. */
export const unparsedTextFunctions = [
  ...family("unparsed-text", "xs:string?", (load) => [stringItem(load())], []),
  ...family(
    "unparsed-text-lines",
    "xs:string*",
    (load) => splitLines(load()).map(stringItem),
    [],
  ),
  ...family("unparsed-text-available", "xs:boolean", available, [
    booleanItem(false),
  ]),
];
