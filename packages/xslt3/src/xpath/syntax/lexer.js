/**
 * XPath 3.1 lexer (XPath 3.1 Appendix A.2, lexical structure).
 *
 * Keywords are not reserved in XPath, so the lexer does not know them: `div`,
 * `for` or `union` come out as name tokens and the parser decides from the
 * context whether a name is an operator, a keyword or a name test. Names
 * follow maximal munch, so `a-b` is one name while `a - b` and `a -b` are a
 * subtraction (A.2.2). Comments `(: ... :)`, which nest, count as whitespace.
 *
 * @module @tradik/xslt3/xpath/syntax/lexer
 */

import {
  NAME_START_CHAR,
  NCNAME,
  NUMBER,
  WHITESPACE,
  matchAt,
  normalizeSpace,
} from "./chars.js";
import { syntaxError } from "./syntaxError.js";

/**
 * A token. `type` is "name" (NCName, QName or EQName: `prefix`, `local`,
 * `uri`), "wildcard" (`prefix:*`, `*:local`, `Q{uri}*`; a bare `*` is the
 * symbol "*"), "integer", "decimal", "double", "string" (`value` holds the
 * lexical form of a number, the unescaped content of a string), "symbol"
 * (`value` is the operator or punctuation) or "eof".
 *
 * @typedef {object} Token
 * @property {"name"|"wildcard"|"integer"|"decimal"|"double"|"string"|"symbol"|"eof"} type
 * @property {string} [value] - Symbol, literal content or numeric lexical form
 * @property {string|null} [prefix] - Prefix of a name or wildcard
 * @property {string|null} [local] - Local part of a name or wildcard
 * @property {string|null} [uri] - Namespace of an EQName / `Q{uri}*`
 * @property {number} start - Offset of the first character
 * @property {number} end - Offset after the last character
 */

/** Symbols of two characters, tried before the single-character ones. */
const LONG_SYMBOLS = new Set("!= <= >= << >> => || // :: := ..".split(" "));
const SHORT_SYMBOLS = new Set("!#$()*+,-./:<=>?@[]{}|");

/** Tokenizer over one expression; use {@link tokenize}. */
class Lexer {
  /** @param {string} source - The expression */
  constructor(source) {
    this.source = source;
    this.pos = 0;
  }

  /** @returns {never} Throws XPST0003 at the current offset. */
  fail(message, offset = this.pos) {
    throw syntaxError(this.source, offset, message);
  }

  /** Skips whitespace and (nested) comments. */
  skipIgnorable() {
    for (;;) {
      const space = matchAt(WHITESPACE, this.source, this.pos);
      if (space) this.pos += space.length;
      else if (this.source.startsWith("(:", this.pos)) this.skipComment();
      else return;
    }
  }

  /** Skips one comment, which may contain nested comments. */
  skipComment() {
    const start = this.pos;
    let depth = 0;
    do {
      if (this.pos >= this.source.length) this.fail("Unclosed comment", start);
      if (this.source.startsWith("(:", this.pos)) {
        depth++;
        this.pos += 2;
      } else if (this.source.startsWith(":)", this.pos)) {
        depth--;
        this.pos += 2;
      } else this.pos++;
    } while (depth > 0);
  }

  /** @returns {Token} The next token (eof at the end). */
  next() {
    this.skipIgnorable();
    const { source, pos } = this;
    const char = source[pos];
    if (pos >= source.length) return { type: "eof", start: pos, end: pos };
    if (char === '"' || char === "'") return this.string(char);
    if (matchAt(NUMBER, source, pos)) return this.number();
    if (source.startsWith("Q{", pos)) return this.bracedName();
    if (matchAt(NCNAME, source, pos)) return this.name();
    if (char === "*" && source[pos + 1] === ":") {
      const local = matchAt(NCNAME, source, pos + 2);
      if (local) {
        return this.named(
          "wildcard",
          null,
          local,
          null,
          pos + 2 + local.length,
        );
      }
    }
    const pair = source.slice(pos, pos + 2);
    if (LONG_SYMBOLS.has(pair)) {
      return this.token("symbol", { value: pair }, pos + 2);
    }
    if (SHORT_SYMBOLS.has(char)) {
      return this.token("symbol", { value: char }, pos + 1);
    }
    return this.fail(`Unexpected character ${JSON.stringify(char)}`);
  }

  /** @returns {Token} A token from the current offset to `end`. */
  token(type, fields, end) {
    const token = Object.assign({ type }, fields);
    token.start = this.pos;
    token.end = end;
    this.pos = end;
    return token;
  }

  /** @returns {Token} A string literal; `""` / `''` stand for one quote. */
  string(quote) {
    let value = "";
    let at = this.pos + 1;
    for (;;) {
      const close = this.source.indexOf(quote, at);
      if (close < 0) this.fail("Unterminated string literal");
      value += this.source.slice(at, close);
      if (this.source[close + 1] !== quote) {
        return this.token("string", { value }, close + 1);
      }
      value += quote;
      at = close + 2;
    }
  }

  /** @returns {Token} A numeric literal, keeping its lexical form. */
  number() {
    const text = matchAt(NUMBER, this.source, this.pos);
    const end = this.pos + text.length;
    // A.2.2: a numeric literal must not run into a name ("10div") or into
    // another numeric literal ("1.2.3").
    if (
      matchAt(NAME_START_CHAR, this.source, end) ||
      matchAt(NUMBER, this.source, end)
    ) {
      this.fail("Numeric literal followed by a name or number", end);
    }
    let type = "integer";
    if (/[eE]/.test(text)) type = "double";
    else if (text.includes(".")) type = "decimal";
    return this.token(type, { value: text }, end);
  }

  /**
   * @param {"name"|"wildcard"} type - Token type
   * @param {string|null} prefix - Prefix
   * @param {string|null} local - Local name
   * @param {string|null} uri - Braced URI
   * @param {number} end - Offset after the token
   * @returns {Token} A name or wildcard token
   */
  named(type, prefix, local, uri, end) {
    return this.token(type, { prefix, local, uri }, end);
  }

  /** @returns {Token} `Q{uri}local` or `Q{uri}*`. */
  bracedName() {
    const close = this.source.indexOf("}", this.pos + 2);
    const open = this.source.indexOf("{", this.pos + 2);
    if (close < 0 || (open >= 0 && open < close)) {
      this.fail("Malformed braced URI literal");
    }
    // The namespace is whitespace-normalized like an xs:anyURI.
    const uri = normalizeSpace(this.source.slice(this.pos + 2, close));
    if (this.source[close + 1] === "*") {
      return this.named("wildcard", null, null, uri, close + 2);
    }
    const local = matchAt(NCNAME, this.source, close + 1);
    if (!local) this.fail("Expected a local name", close + 1);
    return this.named("name", null, local, uri, close + 1 + local.length);
  }

  /** @returns {Token} An NCName, a QName or a `prefix:*` wildcard. */
  name() {
    const first = matchAt(NCNAME, this.source, this.pos);
    const end = this.pos + first.length;
    if (this.source[end] === ":") {
      const local = matchAt(NCNAME, this.source, end + 1);
      if (local) {
        return this.named("name", first, local, null, end + 1 + local.length);
      }
      if (this.source[end + 1] === "*") {
        return this.named("wildcard", first, null, null, end + 2);
      }
    }
    return this.named("name", null, first, null, end);
  }
}

/**
 * Splits an expression into tokens, comments and whitespace removed.
 *
 * @param {string} source - XPath expression
 * @returns {Token[]} The tokens, the last one of type "eof"
 * @throws {import("../../errors.js").XPathError} XPST0003 on a lexical error
 */
export function tokenize(source) {
  const lexer = new Lexer(source);
  const tokens = [];
  let token;
  do {
    token = lexer.next();
    tokens.push(token);
  } while (token.type !== "eof");
  return tokens;
}
