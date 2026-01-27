/**
 * XPath 1.0 Tokenizer
 * Based on W3C XPath 1.0 Specification: http://www.w3.org/TR/1999/REC-xpath-19991116
 *
 * Converts XPath expression strings into token streams for parsing.
 */

'use strict';

export const TokenType = {
  // Literals
  NUMBER: 'NUMBER',
  LITERAL: 'LITERAL',

  // Operators
  SLASH: 'SLASH',
  DOUBLE_SLASH: 'DOUBLE_SLASH',
  PIPE: 'PIPE',
  PLUS: 'PLUS',
  MINUS: 'MINUS',
  STAR: 'STAR',
  DIV: 'DIV',
  MOD: 'MOD',
  EQUALS: 'EQUALS',
  NOT_EQUALS: 'NOT_EQUALS',
  LT: 'LT',
  LTE: 'LTE',
  GT: 'GT',
  GTE: 'GTE',
  AND: 'AND',
  OR: 'OR',

  // Brackets
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',

  // Axes
  AXIS: 'AXIS',
  AT: 'AT',
  DOT: 'DOT',
  DOUBLE_DOT: 'DOUBLE_DOT',
  DOUBLE_COLON: 'DOUBLE_COLON',

  // Names
  NAME: 'NAME',
  NCNAME: 'NCNAME',
  PREFIX: 'PREFIX',
  FUNCTION: 'FUNCTION',
  NODE_TYPE: 'NODE_TYPE',

  // Other
  COMMA: 'COMMA',
  DOLLAR: 'DOLLAR',
  COLON: 'COLON',
  EOF: 'EOF'
};

const AXIS_NAMES = new Set([
  'ancestor',
  'ancestor-or-self',
  'attribute',
  'child',
  'descendant',
  'descendant-or-self',
  'following',
  'following-sibling',
  'namespace',
  'parent',
  'preceding',
  'preceding-sibling',
  'self'
]);

const NODE_TYPES = new Set(['comment', 'text', 'processing-instruction', 'node']);

const OPERATORS = new Set(['and', 'or', 'mod', 'div']);

export class Token {
  constructor(type, value, position) {
    this.type = type;
    this.value = value;
    this.position = position;
  }

  toString() {
    return `Token(${this.type}, ${JSON.stringify(this.value)}, pos=${this.position})`;
  }
}

// Tokens that indicate the NEXT token should NOT be treated as an OperatorName
// Per XPath 1.0 spec: "If there is a preceding token and the preceding token is not one of
// @, ::, (, [, , or an Operator, then... an NCName must be recognized as an OperatorName."
// So after these tokens, OperatorNames (div, mod, and, or) should be treated as regular names.
const OPERATOR_CONTEXT_BLOCKERS = new Set([
  TokenType.AT,
  TokenType.DOUBLE_COLON,
  TokenType.LPAREN,
  TokenType.LBRACKET,
  TokenType.COMMA,
  // Operators - after an operator, next name token should be a name, not an operator
  TokenType.SLASH,
  TokenType.DOUBLE_SLASH,
  TokenType.PIPE,
  TokenType.PLUS,
  TokenType.MINUS,
  TokenType.STAR,
  TokenType.DIV,
  TokenType.MOD,
  TokenType.EQUALS,
  TokenType.NOT_EQUALS,
  TokenType.LT,
  TokenType.LTE,
  TokenType.GT,
  TokenType.GTE,
  TokenType.AND,
  TokenType.OR
]);

export class XPathTokenizer {
  constructor(expression) {
    this.expression = expression;
    this.position = 0;
    this.tokens = [];
  }

  /**
   * Get the last token that was added (if any)
   */
  getLastToken() {
    return this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : null;
  }

  /**
   * Check if the current context allows operator names (div, mod, and, or)
   * Per XPath 1.0 spec disambiguation rules.
   */
  isOperatorContext() {
    const lastToken = this.getLastToken();
    // No preceding token means we're at the start - not an operator context
    if (!lastToken) return false;
    // If preceding token is a "blocker", it's not an operator context
    if (OPERATOR_CONTEXT_BLOCKERS.has(lastToken.type)) return false;
    // Otherwise, it IS an operator context (after names, numbers, closing brackets, etc.)
    return true;
  }

  tokenize() {
    this.tokens = [];
    this.position = 0;

    while (this.position < this.expression.length) {
      this.skipWhitespace();
      if (this.position >= this.expression.length) break;

      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    this.tokens.push(new Token(TokenType.EOF, null, this.position));
    return this.tokens;
  }

  skipWhitespace() {
    while (
      this.position < this.expression.length &&
      /\s/.test(this.expression[this.position])
    ) {
      this.position++;
    }
  }

  peek(offset = 0) {
    return this.expression[this.position + offset];
  }

  consume() {
    return this.expression[this.position++];
  }

  nextToken() {
    const startPos = this.position;
    const char = this.peek();

    // String literals
    if (char === '"' || char === "'") {
      return this.readStringLiteral();
    }

    // Numbers
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(this.peek(1)))) {
      return this.readNumber();
    }

    // Multi-character operators
    if (char === '/' && this.peek(1) === '/') {
      this.position += 2;
      return new Token(TokenType.DOUBLE_SLASH, '//', startPos);
    }

    if (char === '.' && this.peek(1) === '.') {
      this.position += 2;
      return new Token(TokenType.DOUBLE_DOT, '..', startPos);
    }

    if (char === ':' && this.peek(1) === ':') {
      this.position += 2;
      return new Token(TokenType.DOUBLE_COLON, '::', startPos);
    }

    if (char === '!' && this.peek(1) === '=') {
      this.position += 2;
      return new Token(TokenType.NOT_EQUALS, '!=', startPos);
    }

    if (char === '<' && this.peek(1) === '=') {
      this.position += 2;
      return new Token(TokenType.LTE, '<=', startPos);
    }

    if (char === '>' && this.peek(1) === '=') {
      this.position += 2;
      return new Token(TokenType.GTE, '>=', startPos);
    }

    // Single-character tokens
    const singleCharTokens = {
      '/': TokenType.SLASH,
      '|': TokenType.PIPE,
      '+': TokenType.PLUS,
      '-': TokenType.MINUS,
      '*': TokenType.STAR,
      '=': TokenType.EQUALS,
      '<': TokenType.LT,
      '>': TokenType.GT,
      '(': TokenType.LPAREN,
      ')': TokenType.RPAREN,
      '[': TokenType.LBRACKET,
      ']': TokenType.RBRACKET,
      '@': TokenType.AT,
      '.': TokenType.DOT,
      ',': TokenType.COMMA,
      '$': TokenType.DOLLAR,
      ':': TokenType.COLON
    };

    if (singleCharTokens[char]) {
      this.position++;
      return new Token(singleCharTokens[char], char, startPos);
    }

    // Names and keywords
    if (this.isNameStartChar(char)) {
      return this.readName();
    }

    throw new Error(
      `Unexpected character '${char}' at position ${this.position} in expression: ${this.expression}`
    );
  }

  readStringLiteral() {
    const startPos = this.position;
    const quote = this.consume();
    let value = '';

    while (this.position < this.expression.length && this.peek() !== quote) {
      value += this.consume();
    }

    if (this.position >= this.expression.length) {
      throw new Error(`Unterminated string literal at position ${startPos}`);
    }

    this.consume(); // closing quote
    return new Token(TokenType.LITERAL, value, startPos);
  }

  readNumber() {
    const startPos = this.position;
    let value = '';

    // Integer part
    while (this.position < this.expression.length && /[0-9]/.test(this.peek())) {
      value += this.consume();
    }

    // Decimal part (handles both 1.5 and .5 style numbers)
    // For .5 style: entry condition ensures digit follows, so this branch handles it
    if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
      value += this.consume(); // .
      while (this.position < this.expression.length && /[0-9]/.test(this.peek())) {
        value += this.consume();
      }
    }

    return new Token(TokenType.NUMBER, parseFloat(value), startPos);
  }

  readName() {
    const startPos = this.position;
    let value = '';

    while (this.position < this.expression.length && this.isNameChar(this.peek())) {
      value += this.consume();
    }

    // Check for axis name followed by ::
    this.skipWhitespace();
    if (AXIS_NAMES.has(value) && this.peek() === ':' && this.peek(1) === ':') {
      return new Token(TokenType.AXIS, value, startPos);
    }

    // Check for function call (followed by '(')
    const savedPos = this.position;
    this.skipWhitespace();
    if (this.peek() === '(') {
      // Check if it's a node type test
      if (NODE_TYPES.has(value)) {
        return new Token(TokenType.NODE_TYPE, value, startPos);
      }
      return new Token(TokenType.FUNCTION, value, startPos);
    }
    this.position = savedPos;

    // Check for operators - only in operator context per XPath 1.0 disambiguation rules
    if (OPERATORS.has(value) && this.isOperatorContext()) {
      const opTokens = {
        and: TokenType.AND,
        or: TokenType.OR,
        mod: TokenType.MOD,
        div: TokenType.DIV
      };
      return new Token(opTokens[value], value, startPos);
    }

    return new Token(TokenType.NAME, value, startPos);
  }

  isNameStartChar(char) {
    if (!char) return false;
    const code = char.charCodeAt(0);
    return (
      char === '_' ||
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122) || // a-z
      code >= 0xc0 // Unicode letters
    );
  }

  isNameChar(char) {
    if (!char) return false;
    const code = char.charCodeAt(0);
    return (
      this.isNameStartChar(char) ||
      char === '-' ||
      char === '.' ||
      (code >= 48 && code <= 57) // 0-9
    );
  }
}

export function tokenize(expression) {
  const tokenizer = new XPathTokenizer(expression);
  return tokenizer.tokenize();
}
