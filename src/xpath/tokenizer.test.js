/**
 * XPath Tokenizer Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tokenize, TokenType } from './tokenizer.js';

describe('XPath Tokenizer', () => {
  describe('Simple paths', () => {
    it('should tokenize simple element name', () => {
      const tokens = tokenize('foo');
      assert.strictEqual(tokens.length, 2);
      assert.strictEqual(tokens[0].type, TokenType.NAME);
      assert.strictEqual(tokens[0].value, 'foo');
      assert.strictEqual(tokens[1].type, TokenType.EOF);
    });

    it('should tokenize root path', () => {
      const tokens = tokenize('/');
      assert.strictEqual(tokens[0].type, TokenType.SLASH);
    });

    it('should tokenize absolute path', () => {
      const tokens = tokenize('/foo/bar');
      assert.strictEqual(tokens[0].type, TokenType.SLASH);
      assert.strictEqual(tokens[1].type, TokenType.NAME);
      assert.strictEqual(tokens[1].value, 'foo');
      assert.strictEqual(tokens[2].type, TokenType.SLASH);
      assert.strictEqual(tokens[3].type, TokenType.NAME);
      assert.strictEqual(tokens[3].value, 'bar');
    });

    it('should tokenize descendant path', () => {
      const tokens = tokenize('//foo');
      assert.strictEqual(tokens[0].type, TokenType.DOUBLE_SLASH);
      assert.strictEqual(tokens[1].type, TokenType.NAME);
      assert.strictEqual(tokens[1].value, 'foo');
    });
  });

  describe('Wildcards and special characters', () => {
    it('should tokenize wildcard', () => {
      const tokens = tokenize('*');
      assert.strictEqual(tokens[0].type, TokenType.STAR);
    });

    it('should tokenize attribute selector', () => {
      const tokens = tokenize('@id');
      assert.strictEqual(tokens[0].type, TokenType.AT);
      assert.strictEqual(tokens[1].type, TokenType.NAME);
      assert.strictEqual(tokens[1].value, 'id');
    });

    it('should tokenize dot (self)', () => {
      const tokens = tokenize('.');
      assert.strictEqual(tokens[0].type, TokenType.DOT);
    });

    it('should tokenize double dot (parent)', () => {
      const tokens = tokenize('..');
      assert.strictEqual(tokens[0].type, TokenType.DOUBLE_DOT);
    });
  });

  describe('Predicates', () => {
    it('should tokenize predicate brackets', () => {
      const tokens = tokenize('foo[1]');
      assert.strictEqual(tokens[0].type, TokenType.NAME);
      assert.strictEqual(tokens[1].type, TokenType.LBRACKET);
      assert.strictEqual(tokens[2].type, TokenType.NUMBER);
      assert.strictEqual(tokens[2].value, 1);
      assert.strictEqual(tokens[3].type, TokenType.RBRACKET);
    });

    it('should tokenize complex predicate', () => {
      const tokens = tokenize('item[@id="test"]');
      assert.strictEqual(tokens[0].type, TokenType.NAME);
      assert.strictEqual(tokens[1].type, TokenType.LBRACKET);
      assert.strictEqual(tokens[2].type, TokenType.AT);
      assert.strictEqual(tokens[3].type, TokenType.NAME);
      assert.strictEqual(tokens[4].type, TokenType.EQUALS);
      assert.strictEqual(tokens[5].type, TokenType.LITERAL);
      assert.strictEqual(tokens[5].value, 'test');
      assert.strictEqual(tokens[6].type, TokenType.RBRACKET);
    });
  });

  describe('Operators', () => {
    it('should tokenize arithmetic operators', () => {
      const tokens = tokenize('1 + 2 - 3 * 4');
      assert.strictEqual(tokens[0].type, TokenType.NUMBER);
      assert.strictEqual(tokens[1].type, TokenType.PLUS);
      assert.strictEqual(tokens[2].type, TokenType.NUMBER);
      assert.strictEqual(tokens[3].type, TokenType.MINUS);
      assert.strictEqual(tokens[4].type, TokenType.NUMBER);
      assert.strictEqual(tokens[5].type, TokenType.STAR);
      assert.strictEqual(tokens[6].type, TokenType.NUMBER);
    });

    it('should tokenize comparison operators', () => {
      const tokens = tokenize('a = b != c < d <= e > f >= g');
      assert.strictEqual(tokens[1].type, TokenType.EQUALS);
      assert.strictEqual(tokens[3].type, TokenType.NOT_EQUALS);
      assert.strictEqual(tokens[5].type, TokenType.LT);
      assert.strictEqual(tokens[7].type, TokenType.LTE);
      assert.strictEqual(tokens[9].type, TokenType.GT);
      assert.strictEqual(tokens[11].type, TokenType.GTE);
    });

    it('should tokenize logical operators', () => {
      const tokens = tokenize('a and b or c');
      assert.strictEqual(tokens[0].type, TokenType.NAME);
      assert.strictEqual(tokens[1].type, TokenType.AND);
      assert.strictEqual(tokens[2].type, TokenType.NAME);
      assert.strictEqual(tokens[3].type, TokenType.OR);
      assert.strictEqual(tokens[4].type, TokenType.NAME);
    });

    it('should tokenize div and mod', () => {
      const tokens = tokenize('10 div 3 mod 2');
      assert.strictEqual(tokens[1].type, TokenType.DIV);
      assert.strictEqual(tokens[3].type, TokenType.MOD);
    });

    it('should tokenize union operator', () => {
      const tokens = tokenize('a | b');
      assert.strictEqual(tokens[1].type, TokenType.PIPE);
    });
  });

  describe('Literals', () => {
    it('should tokenize double-quoted string', () => {
      const tokens = tokenize('"hello world"');
      assert.strictEqual(tokens[0].type, TokenType.LITERAL);
      assert.strictEqual(tokens[0].value, 'hello world');
    });

    it('should tokenize single-quoted string', () => {
      const tokens = tokenize("'hello world'");
      assert.strictEqual(tokens[0].type, TokenType.LITERAL);
      assert.strictEqual(tokens[0].value, 'hello world');
    });

    it('should tokenize integer', () => {
      const tokens = tokenize('42');
      assert.strictEqual(tokens[0].type, TokenType.NUMBER);
      assert.strictEqual(tokens[0].value, 42);
    });

    it('should tokenize decimal number', () => {
      const tokens = tokenize('3.14');
      assert.strictEqual(tokens[0].type, TokenType.NUMBER);
      assert.strictEqual(tokens[0].value, 3.14);
    });

    it('should tokenize decimal starting with dot', () => {
      const tokens = tokenize('.5');
      assert.strictEqual(tokens[0].type, TokenType.NUMBER);
      assert.strictEqual(tokens[0].value, 0.5);
    });
  });

  describe('Functions', () => {
    it('should tokenize function call', () => {
      const tokens = tokenize('contains(a, b)');
      assert.strictEqual(tokens[0].type, TokenType.FUNCTION);
      assert.strictEqual(tokens[0].value, 'contains');
      assert.strictEqual(tokens[1].type, TokenType.LPAREN);
      assert.strictEqual(tokens[2].type, TokenType.NAME);
      assert.strictEqual(tokens[3].type, TokenType.COMMA);
      assert.strictEqual(tokens[4].type, TokenType.NAME);
      assert.strictEqual(tokens[5].type, TokenType.RPAREN);
    });

    it('should tokenize node type test', () => {
      const tokens = tokenize('text()');
      assert.strictEqual(tokens[0].type, TokenType.NODE_TYPE);
      assert.strictEqual(tokens[0].value, 'text');
    });

    it('should tokenize processing-instruction test', () => {
      const tokens = tokenize('processing-instruction()');
      assert.strictEqual(tokens[0].type, TokenType.NODE_TYPE);
      assert.strictEqual(tokens[0].value, 'processing-instruction');
    });
  });

  describe('Axes', () => {
    it('should tokenize axis with double colon', () => {
      const tokens = tokenize('child::foo');
      assert.strictEqual(tokens[0].type, TokenType.AXIS);
      assert.strictEqual(tokens[0].value, 'child');
      assert.strictEqual(tokens[1].type, TokenType.DOUBLE_COLON);
      assert.strictEqual(tokens[2].type, TokenType.NAME);
    });

    it('should tokenize descendant-or-self axis', () => {
      const tokens = tokenize('descendant-or-self::node()');
      assert.strictEqual(tokens[0].type, TokenType.AXIS);
      assert.strictEqual(tokens[0].value, 'descendant-or-self');
    });
  });

  describe('Variables', () => {
    it('should tokenize variable reference', () => {
      const tokens = tokenize('$myVar');
      assert.strictEqual(tokens[0].type, TokenType.DOLLAR);
      assert.strictEqual(tokens[1].type, TokenType.NAME);
      assert.strictEqual(tokens[1].value, 'myVar');
    });
  });

  describe('Complex expressions', () => {
    it('should tokenize complex XPath expression', () => {
      const expr = '//div[@class="content"]/p[position() > 1 and @id]';
      const tokens = tokenize(expr);

      // Verify tokenization completed without error
      assert.ok(tokens.length > 0);
      assert.strictEqual(tokens[tokens.length - 1].type, TokenType.EOF);
    });
  });
});
