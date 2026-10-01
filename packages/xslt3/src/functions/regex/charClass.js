/**
 * Character classes of XPath regular expressions (XSD 1.1
 * Part 2 appendix G with the F&O 3.1 section 5.6.1 extensions), translated
 * to JavaScript `u`-mode syntax.
 *
 * A class item is either `{ set }`, text that fits inside a JS `[...]`
 * (characters, ranges, `\p{..}`), or `{ atom }`, a standalone JS
 * expression matching one character (used for negated sets such as `\w`
 * and `\I`, which cannot be nested in a JS class). Single characters also
 * carry `char`, their codepoint, so they can start or end a range.
 * Subtraction `[a-z-[aeiou]]` and negated mixtures become a negative
 * lookahead in the generated expression: `(?:(?![aeiou])[a-z])`.
 *
 * @module @tradik/xslt3/functions/regex/charClass
 */

import { jsChar, parseEscape, regexError } from "./escapes.js";

/**
 * One class character: an escape or a literal character. An unescaped
 * "-" is a literal at the start or end of the group and right after a
 * range (as in [a-c-x], XSD 1.1); it then cannot start a range.
 * @param {import("./reader.js").RegexReader} reader
 * @param {boolean} hyphenAllowed - First item, or after a range
 * @returns {{set?: string, atom?: string, char?: number, hyphen?: boolean}}
 */
function classChar(reader, hyphenAllowed) {
  const c = reader.next();
  if (c === "\\") return parseEscape(reader);
  if (c === "[") regexError("unescaped [ in a character class");
  const cp = c.codePointAt(0);
  if (c === "-" && reader.peek() !== "]") {
    if (!hyphenAllowed) regexError("misplaced - in a character class");
    return { char: cp, set: jsChar(cp), hyphen: true };
  }
  return { char: cp, set: jsChar(cp) };
}

/**
 * A JS expression matching one character of any of the items.
 * @param {Array<{set?: string, atom?: string}>} items
 * @param {boolean} negated
 * @returns {string}
 */
function itemsToAtom(items, negated) {
  const set = items.map((item) => item.set ?? "").join("");
  const atoms = items.filter((item) => item.set === undefined);
  if (atoms.length === 0) return `[${negated ? "^" : ""}${set}]`;
  const alternatives = (set ? [`[${set}]`] : []).concat(
    atoms.map((item) => item.atom),
  );
  const positive =
    alternatives.length === 1
      ? alternatives[0]
      : `(?:${alternatives.join("|")})`;
  return negated ? `(?:(?!${positive})[^])` : positive;
}

/**
 * Parses a character class expression; the reader is after its "[".
 * @param {import("./reader.js").RegexReader} reader
 * @returns {string} JS expression matching one character
 * @throws {XPathError} FORX0002 for invalid classes
 */
export function parseCharClass(reader) {
  const negated = reader.peek() === "^";
  if (negated) reader.next();
  const items = [];
  let subtraction = null;
  for (;;) {
    const c = reader.peek();
    if (c === undefined) regexError("unterminated character class");
    if (items.length > 0 && c === "-" && reader.peek(1) === "[") {
      reader.next();
      reader.next();
      subtraction = parseCharClass(reader);
      if (reader.next() !== "]") regexError("expected ] after subtraction");
      break;
    }
    if (c === "]") {
      reader.next();
      if (items.length === 0) regexError("empty character class");
      break;
    }
    const item = classChar(
      reader,
      items.length === 0 || items.at(-1).range === true,
    );
    const next = reader.peek(1);
    if (
      item.char === undefined ||
      (item.hyphen && items.length > 0) ||
      reader.peek() !== "-" ||
      next === "]"
    ) {
      items.push(item);
      continue;
    }
    if (next === "[" || next === undefined) {
      items.push(item);
      continue;
    }
    reader.next();
    const end = classChar(reader, false);
    if (end.char === undefined || end.char < item.char) {
      regexError("invalid character range");
    }
    items.push({ set: `${item.set}-${end.set}`, range: true });
  }
  const atom = itemsToAtom(items, negated);
  return subtraction === null ? atom : `(?:(?!${subtraction})${atom})`;
}
