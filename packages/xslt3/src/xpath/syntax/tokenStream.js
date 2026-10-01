/**
 * Cursor over the tokens of one expression, shared by the parser modules.
 *
 * Keywords are recognised here by spelling only: a keyword is an unprefixed
 * name token without a braced URI, so `fn:div` or `Q{}div` never are.
 *
 * @module @tradik/xslt3/xpath/syntax/tokenStream
 */

import { tokenize } from "./lexer.js";
import { syntaxError } from "./syntaxError.js";

/**
 * Describes a token for error messages.
 *
 * @param {import("./lexer.js").Token} token - Token
 * @param {string} source - The expression
 * @returns {string} e.g. `")"` or "end of expression"
 */
function describe(token, source) {
  if (token.type === "eof") return "end of expression";
  return JSON.stringify(source.slice(token.start, token.end));
}

/** Tokens of an expression with a read position. */
export class TokenStream {
  /**
   * @param {string} source - XPath expression
   * @param {object} [options] - Parser options (see parseXPath)
   */
  constructor(source, options = {}) {
    this.source = source;
    this.options = options;
    this.tokens = tokenize(source);
    this.index = 0;
    /** Offset after the last consumed token. */
    this.lastEnd = 0;
  }

  /**
   * @param {number} [ahead] - 0 for the current token, 1 for the next...
   * @returns {import("./lexer.js").Token} The token (eof past the end)
   */
  peek(ahead = 0) {
    const last = this.tokens.length - 1;
    return this.tokens[Math.min(this.index + ahead, last)];
  }

  /** @returns {import("./lexer.js").Token} The current token, consumed. */
  next() {
    const token = this.peek();
    if (token.type !== "eof") this.index++;
    this.lastEnd = token.end;
    return token;
  }

  /**
   * @param {string} value - Symbol, e.g. "("
   * @param {number} [ahead] - Lookahead distance
   * @returns {boolean} Whether that token is the symbol
   */
  isSymbol(value, ahead = 0) {
    const token = this.peek(ahead);
    return token.type === "symbol" && token.value === value;
  }

  /**
   * @param {string} word - Keyword, e.g. "div"
   * @param {number} [ahead] - Lookahead distance
   * @returns {boolean} Whether that token is the keyword
   */
  isKeyword(word, ahead = 0) {
    const token = this.peek(ahead);
    return isPlainName(token) && token.local === word;
  }

  /**
   * Consumes the current token when it is the symbol.
   *
   * @param {string} value - Symbol
   * @returns {import("./lexer.js").Token|null} The token, or null
   */
  acceptSymbol(value) {
    return this.isSymbol(value) ? this.next() : null;
  }

  /**
   * Consumes the current token when it is the keyword.
   *
   * @param {string} word - Keyword
   * @returns {import("./lexer.js").Token|null} The token, or null
   */
  acceptKeyword(word) {
    return this.isKeyword(word) ? this.next() : null;
  }

  /**
   * Consumes the symbol or fails.
   *
   * @param {string} value - Expected symbol
   * @returns {import("./lexer.js").Token} The token
   */
  expectSymbol(value) {
    return this.acceptSymbol(value) ?? this.fail(`Expected "${value}"`);
  }

  /**
   * Consumes the keyword or fails.
   *
   * @param {string} word - Expected keyword
   * @returns {import("./lexer.js").Token} The token
   */
  expectKeyword(word) {
    return this.acceptKeyword(word) ?? this.fail(`Expected "${word}"`);
  }

  /**
   * Consumes a name token (NCName, QName or EQName) or fails.
   *
   * @param {string} [what] - What the name is, for the message
   * @returns {import("./lexer.js").Token} The token
   */
  expectName(what = "a name") {
    if (this.peek().type !== "name") this.fail(`Expected ${what}`);
    return this.next();
  }

  /**
   * Throws XPST0003 (or another code) at the current token.
   *
   * @param {string} message - What was expected
   * @param {import("./lexer.js").Token} [token] - Offending token
   * @param {string} [code] - Error code
   * @returns {never}
   */
  fail(message, token = this.peek(), code = undefined) {
    const found = describe(token, this.source);
    throw syntaxError(
      this.source,
      token.start,
      `${message}, found ${found}`,
      code,
    );
  }
}

/**
 * @param {import("./lexer.js").Token} token - Token
 * @returns {boolean} Whether it is a name without prefix and braced URI
 */
export function isPlainName(token) {
  return token.type === "name" && token.prefix === null && token.uri === null;
}

/**
 * The QName fields of a name or wildcard token, as kept in the AST.
 *
 * @param {import("./lexer.js").Token} token - Name token
 * @returns {import("./ast.js").QName} `{ prefix, local, uri }`
 */
export function qName(token) {
  return { prefix: token.prefix, local: token.local, uri: token.uri };
}
