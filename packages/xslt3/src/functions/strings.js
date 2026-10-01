/**
 * Functions on strings (F&O 3.1 sections 5.2, 5.3 and 5.4): codepoints,
 * comparison, substring, normalization, case mapping, translate and
 * contains-token. Strings are handled as sequences of Unicode codepoints,
 * not UTF-16 code units.
 *
 * @module @tradik/xslt3/functions/strings
 */

import { XPathError } from "../errors.js";
import { normalizeWhitespace } from "../xdm/strings.js";
import { collationArg } from "./collations.js";
import {
  booleanItem,
  contextString,
  define,
  integerItem,
  stringArg,
  stringItem,
} from "./support.js";

/**
 * @param {number} cp
 * @returns {boolean} whether the codepoint is an XML 1.0 Char
 */
const isXmlChar = (cp) =>
  cp === 0x9 ||
  cp === 0xa ||
  cp === 0xd ||
  (cp >= 0x20 && cp <= 0xd7ff) ||
  (cp >= 0xe000 && cp <= 0xfffd) ||
  (cp >= 0x10000 && cp <= 0x10ffff);

/**
 * fn:round on a double: nearest integer, halves toward positive infinity.
 * @param {number} x
 * @returns {number}
 */
export function roundHalfUp(x) {
  const floor = Math.floor(x);
  return x - floor >= 0.5 ? floor + 1 : floor;
}

/**
 * The codepoints p (1-based) of a sequence of `length` codepoints with
 * `round(start) <= p < round(start) + round(size)`, the selection rule of
 * fn:substring and fn:subsequence (comparisons with NaN are false).
 * @param {number} length
 * @param {number} start
 * @param {number} [size] - All remaining when undefined
 * @returns {[number, number]} 0-based [from, to) slice bounds, from >= to
 *   when nothing is selected
 */
export function selectRange(length, start, size) {
  const first = roundHalfUp(start);
  const end = size === undefined ? Infinity : first + roundHalfUp(size);
  const from = Math.max(first, 1);
  const to = Math.min(end, length + 1);
  return from < to ? [from - 1, to - 1] : [0, 0];
}

/** @param {string} s @returns {string} XML whitespace collapsed */
const collapse = (s) => normalizeWhitespace(s, "collapse");

/** @param {string} s @returns {string[]} the codepoints as strings */
const codepoints = (s) => Array.from(s);

const NORMALIZATION_FORMS = new Set(["NFC", "NFD", "NFKC", "NFKD"]);

/**
 * fn:normalize-unicode.
 * @param {string} text
 * @param {string} form - Normalization form name (any case, trimmed)
 * @returns {string}
 */
function normalizeUnicode(text, form) {
  const name = collapse(form).toUpperCase();
  if (name === "") return text;
  if (name === "FULLY-NORMALIZED") {
    // NFC, and no composing character at the start (W3C charmod-norm)
    const nfc = text.normalize("NFC");
    return /^\p{M}/u.test(nfc) ? ` ${nfc}` : nfc;
  }
  if (!NORMALIZATION_FORMS.has(name)) {
    throw new XPathError("FOCH0003", `Unsupported normalization form ${form}`);
  }
  return text.normalize(name);
}

/**
 * fn:translate.
 * @param {string} text
 * @param {string} mapString
 * @param {string} transString
 * @returns {string}
 */
function translate(text, mapString, transString) {
  const map = new Map();
  const replacements = codepoints(transString);
  codepoints(mapString).forEach((char, i) => {
    if (!map.has(char)) map.set(char, replacements[i] ?? "");
  });
  return codepoints(text)
    .map((char) => map.get(char) ?? char)
    .join("");
}

/**
 * fn:compare.
 * @param {Array<*>[]} args - [$a, $b, $collation?]
 * @param {object} context
 * @returns {Array<*>}
 */
function compare([a, b, collation], context) {
  const { compare: order } = collationArg(collation, context);
  if (a.length === 0 || b.length === 0) return [];
  return [integerItem(order(a[0].value, b[0].value))];
}

/**
 * fn:contains-token.
 * @param {Array<*>[]} args - [$input, $token, $collation?]
 * @param {object} context
 * @returns {Array<*>}
 */
function containsToken([input, [token], collation], context) {
  const { compare: order } = collationArg(collation, context);
  const wanted = collapse(token.value);
  if (wanted === "") return [booleanItem(false)];
  const found = input.some((item) =>
    collapse(item.value)
      .split(" ")
      .some((part) => order(part, wanted) === 0),
  );
  return [booleanItem(found)];
}

/**
 * fn:substring.
 * @param {Array<*>[]} args - [$source, $start, $length?]
 * @returns {Array<*>}
 */
function substring([source, [start], length]) {
  const chars = codepoints(stringArg(source));
  const size = length === undefined ? undefined : length[0].value;
  const [from, to] = selectRange(chars.length, start.value, size);
  return [stringItem(chars.slice(from, to).join(""))];
}

const S = "xs:string";
const S_OPT = "xs:string?";

/** @type {import("./support.js").FunctionDefinition[]} */
export const stringFunctions = [
  define("codepoints-to-string", ["xs:integer*"], S, ([cps]) => [
    stringItem(
      cps
        .map(({ value }) => {
          const cp = Number(value);
          if (!isXmlChar(cp)) {
            throw new XPathError("FOCH0001", `Invalid codepoint ${value}`);
          }
          return String.fromCodePoint(cp);
        })
        .join(""),
    ),
  ]),
  define("string-to-codepoints", [S_OPT], "xs:integer*", ([s]) =>
    codepoints(stringArg(s)).map((c) => integerItem(c.codePointAt(0))),
  ),
  define("compare", [S_OPT, S_OPT], "xs:integer?", compare),
  define("compare", [S_OPT, S_OPT, S], "xs:integer?", compare),
  define("codepoint-equal", [S_OPT, S_OPT], "xs:boolean?", ([a, b]) =>
    a.length === 0 || b.length === 0
      ? []
      : [booleanItem(a[0].value === b[0].value)],
  ),
  define("substring", [S_OPT, "xs:double"], S, substring),
  define("substring", [S_OPT, "xs:double", "xs:double"], S, substring),
  define(
    "normalize-space",
    [],
    S,
    (_args, context) => [stringItem(collapse(contextString(context)))],
    { focus: true },
  ),
  define("normalize-space", [S_OPT], S, ([s]) => [
    stringItem(collapse(stringArg(s))),
  ]),
  define("normalize-unicode", [S_OPT], S, ([s]) => [
    stringItem(normalizeUnicode(stringArg(s), "NFC")),
  ]),
  define("normalize-unicode", [S_OPT, S], S, ([s, [form]]) => [
    stringItem(normalizeUnicode(stringArg(s), form.value)),
  ]),
  define("upper-case", [S_OPT], S, ([s]) => [
    stringItem(stringArg(s).toUpperCase()),
  ]),
  define("lower-case", [S_OPT], S, ([s]) => [
    stringItem(stringArg(s).toLowerCase()),
  ]),
  define("translate", [S_OPT, S, S], S, ([s, [map], [trans]]) => [
    stringItem(translate(stringArg(s), map.value, trans.value)),
  ]),
  define("contains-token", ["xs:string*", S], "xs:boolean", containsToken),
  define("contains-token", ["xs:string*", S, S], "xs:boolean", containsToken),
];
