/**
 * Escapes of XPath regular expressions (XSD 1.1 Part 2 appendix G and F&O
 * 3.1 section 5.6.1): single-character escapes, multi-character escapes
 * (\s \d \w \i \c and their complements) and \p{..}/\P{..} category and
 * block escapes, as items for charClass.js and parser.js.
 *
 * @module @tradik/xslt3/functions/regex/escapes
 */

import { XPathError } from "../../errors.js";
import { namePatterns } from "../../xdm/types.js";
import { blockRanges } from "./unicodeBlocks.js";

/**
 * @param {string} message
 * @returns {never}
 * @throws {XPathError} FORX0002
 */
export function regexError(message) {
  throw new XPathError("FORX0002", `Invalid regular expression: ${message}`);
}

/**
 * A codepoint as JS regular expression text, valid inside and outside a
 * class in `u` mode.
 * @param {number} cp
 * @returns {string}
 */
export function jsChar(cp) {
  const char = String.fromCodePoint(cp);
  return /[A-Za-z0-9_]/.test(char) ? char : `\\u{${cp.toString(16)}}`;
}

// NameStartChar and NameChar of XML 1.0 fifth edition, with ":"
const [, NAME_START, NAME_CHAR] = /^\^\[(.+?)\]\[(.+)\]\*\$$/.exec(
  namePatterns.name.source,
);
const SPACE = "\\u{9}\\u{a}\\u{d}\\u{20}";

/** Multi-character escapes (XSD G.4.2.4 and XML name escapes). */
const multiEscapes = {
  s: { set: SPACE },
  S: { atom: `[^${SPACE}]` },
  d: { set: "\\p{Nd}" },
  D: { set: "\\P{Nd}" },
  w: { atom: "[^\\p{P}\\p{Z}\\p{C}]" },
  W: { set: "\\p{P}\\p{Z}\\p{C}" },
  i: { set: NAME_START },
  I: { atom: `[^${NAME_START}]` },
  c: { set: NAME_CHAR },
  C: { atom: `[^${NAME_CHAR}]` },
};

/** Characters after "\" that stand for themselves (plus n, r, t). */
const singleEscapes = new Set([..."\\|.?*+(){}-[]^$"]);
const controlEscapes = { n: 0xa, r: 0xd, t: 0x9 };

const categories = new Set(
  (
    "L Lu Ll Lt Lm Lo M Mn Mc Me N Nd Nl No P Pc Pd Ps Pe Pi Pf Po " +
    "Z Zs Zl Zp S Sm Sc Sk So C Cc Cf Co Cn"
  ).split(" "),
);

/**
 * The item of `\p{name}` or `\P{name}` (the reader is after "p" or "P").
 * @param {import("./reader.js").RegexReader} reader
 * @param {boolean} negated - For `\P`
 * @returns {{set?: string, atom?: string}}
 */
function categoryEscape(reader, negated) {
  if (reader.next() !== "{") regexError("expected { after \\p");
  let name = "";
  while (reader.peek() !== undefined && reader.peek() !== "}") {
    name += reader.next();
  }
  if (reader.next() !== "}") regexError("unterminated \\p{");
  if (categories.has(name)) {
    const set = `\\${negated ? "P" : "p"}{${name}}`;
    // with the i flag a category still matches by its own case
    return reader.caseless ? { atom: `(?-i:[${set}])` } : { set };
  }
  const ranges = name.startsWith("Is") && blockRanges(name.slice(2));
  if (!ranges) regexError(`unknown category or block \\p{${name}}`);
  const set = ranges
    .map(([from, to]) => `${jsChar(from)}-${jsChar(to)}`)
    .join("");
  return negated ? { atom: `[^${set}]` } : { set };
}

/**
 * Parses an escape after its backslash (not a back-reference).
 * @param {import("./reader.js").RegexReader} reader
 * @returns {{set?: string, atom?: string, char?: number}}
 * @throws {XPathError} FORX0002 for unknown escapes
 */
export function parseEscape(reader) {
  const c = reader.next();
  if (c === undefined) regexError("trailing backslash");
  if (singleEscapes.has(c)) {
    return { char: c.codePointAt(0), set: jsChar(c.codePointAt(0)) };
  }
  if (c in controlEscapes) {
    return { char: controlEscapes[c], set: jsChar(controlEscapes[c]) };
  }
  if (Object.hasOwn(multiEscapes, c)) return multiEscapes[c];
  if (c === "p" || c === "P") return categoryEscape(reader, c === "P");
  return regexError(`unknown escape \\${c}`);
}
