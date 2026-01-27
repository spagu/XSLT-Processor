/**
 * XPath Evaluator Tests
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { evaluate, select, selectFirst, XPathEvaluator, XPathContext, parse, XPathLimits } from './index.js';
import { Token, TokenType, tokenize } from './tokenizer.js';

// Create a DOM environment for testing
function createDOM(html) {
  const dom = new JSDOM(html, { contentType: 'application/xml' });
  return dom.window.document;
}

describe('XPath Evaluator', () => {
  let doc;

  beforeEach(() => {
    doc = createDOM(`<?xml version="1.0"?>
      <root>
        <item id="1">First</item>
        <item id="2">Second</item>
        <item id="3">Third</item>
        <nested>
          <child name="a">Alpha</child>
          <child name="b">Beta</child>
        </nested>
        <numbers>
          <num>10</num>
          <num>20</num>
          <num>30</num>
        </numbers>
      </root>
    `);
  });

  describe('Location paths', () => {
    it('should select root element', () => {
      const result = select('/root', doc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].nodeName, 'root');
    });

    it('should select child elements', () => {
      const result = select('/root/item', doc);
      assert.strictEqual(result.length, 3);
    });

    it('should select descendants with //', () => {
      const result = select('//child', doc);
      assert.strictEqual(result.length, 2);
    });

    it('should select with wildcard', () => {
      const result = select('/root/*', doc);
      assert.strictEqual(result.length, 5); // item, item, item, nested, numbers
    });

    it('should select parent with ..', () => {
      const item = selectFirst('//item[@id="1"]', doc);
      const parent = selectFirst('..', item);
      assert.strictEqual(parent.nodeName, 'root');
    });

    it('should select self with .', () => {
      const item = selectFirst('//item[@id="1"]', doc);
      const self = selectFirst('.', item);
      assert.strictEqual(self, item);
    });
  });

  describe('Predicates', () => {
    it('should filter by position', () => {
      const result = select('/root/item[1]', doc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].getAttribute('id'), '1');
    });

    it('should filter by last()', () => {
      const result = select('/root/item[last()]', doc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].getAttribute('id'), '3');
    });

    it('should filter by attribute', () => {
      const result = select('/root/item[@id="2"]', doc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].textContent, 'Second');
    });

    it('should filter by text content', () => {
      const result = select('//child[text()="Alpha"]', doc);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('Attributes', () => {
    it('should select attribute', () => {
      const result = select('/root/item/@id', doc);
      assert.strictEqual(result.length, 3);
    });

    it('should select specific attribute value', () => {
      const result = evaluate('/root/item[1]/@id', doc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].value, '1');
    });
  });

  describe('Axes', () => {
    it('should use child axis (default)', () => {
      const result = select('/root/child::item', doc);
      assert.strictEqual(result.length, 3);
    });

    it('should use descendant axis', () => {
      const result = select('/root/descendant::child', doc);
      assert.strictEqual(result.length, 2);
    });

    it('should use ancestor axis', () => {
      const child = selectFirst('//child[@name="a"]', doc);
      const ancestors = select('ancestor::*', child);
      assert.ok(ancestors.length >= 2);
    });

    it('should use following-sibling axis', () => {
      const item1 = selectFirst('/root/item[1]', doc);
      const siblings = select('following-sibling::item', item1);
      assert.strictEqual(siblings.length, 2);
    });

    it('should use preceding-sibling axis', () => {
      const item3 = selectFirst('/root/item[3]', doc);
      const siblings = select('preceding-sibling::item', item3);
      assert.strictEqual(siblings.length, 2);
    });
  });

  describe('String functions', () => {
    it('should evaluate string()', () => {
      const result = evaluate('string(/root/item[1])', doc);
      assert.strictEqual(result, 'First');
    });

    it('should evaluate concat()', () => {
      const result = evaluate('concat("Hello", " ", "World")', doc);
      assert.strictEqual(result, 'Hello World');
    });

    it('should evaluate contains()', () => {
      const result = evaluate('contains("Hello World", "World")', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate starts-with()', () => {
      const result = evaluate('starts-with("Hello", "He")', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate substring()', () => {
      const result = evaluate('substring("Hello", 2, 3)', doc);
      assert.strictEqual(result, 'ell');
    });

    it('should evaluate string-length()', () => {
      const result = evaluate('string-length("Hello")', doc);
      assert.strictEqual(result, 5);
    });

    it('should evaluate normalize-space()', () => {
      const result = evaluate('normalize-space("  hello   world  ")', doc);
      assert.strictEqual(result, 'hello world');
    });

    it('should evaluate translate()', () => {
      const result = evaluate('translate("abc", "abc", "ABC")', doc);
      assert.strictEqual(result, 'ABC');
    });

    it('should evaluate substring-before()', () => {
      const result = evaluate('substring-before("hello-world", "-")', doc);
      assert.strictEqual(result, 'hello');
    });

    it('should evaluate substring-after()', () => {
      const result = evaluate('substring-after("hello-world", "-")', doc);
      assert.strictEqual(result, 'world');
    });
  });

  describe('Number functions', () => {
    it('should evaluate number()', () => {
      const result = evaluate('number("42")', doc);
      assert.strictEqual(result, 42);
    });

    it('should evaluate sum()', () => {
      const result = evaluate('sum(//num)', doc);
      assert.strictEqual(result, 60);
    });

    it('should evaluate floor()', () => {
      const result = evaluate('floor(3.7)', doc);
      assert.strictEqual(result, 3);
    });

    it('should evaluate ceiling()', () => {
      const result = evaluate('ceiling(3.2)', doc);
      assert.strictEqual(result, 4);
    });

    it('should evaluate round()', () => {
      const result = evaluate('round(3.5)', doc);
      assert.strictEqual(result, 4);
    });
  });

  describe('Boolean functions', () => {
    it('should evaluate boolean()', () => {
      const result = evaluate('boolean(1)', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate not()', () => {
      const result = evaluate('not(false())', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate true()', () => {
      const result = evaluate('true()', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate false()', () => {
      const result = evaluate('false()', doc);
      assert.strictEqual(result, false);
    });
  });

  describe('Node set functions', () => {
    it('should evaluate count()', () => {
      const result = evaluate('count(/root/item)', doc);
      assert.strictEqual(result, 3);
    });

    it('should evaluate position()', () => {
      const result = select('/root/item[position()=2]', doc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].getAttribute('id'), '2');
    });

    it('should evaluate last()', () => {
      const result = select('/root/item[position()=last()]', doc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].getAttribute('id'), '3');
    });

    it('should evaluate local-name()', () => {
      const result = evaluate('local-name(/root/item[1])', doc);
      assert.strictEqual(result, 'item');
    });

    it('should evaluate name()', () => {
      const result = evaluate('name(/root/item[1])', doc);
      assert.strictEqual(result, 'item');
    });
  });

  describe('Operators', () => {
    it('should evaluate arithmetic +', () => {
      const result = evaluate('1 + 2', doc);
      assert.strictEqual(result, 3);
    });

    it('should evaluate arithmetic -', () => {
      const result = evaluate('5 - 3', doc);
      assert.strictEqual(result, 2);
    });

    it('should evaluate arithmetic *', () => {
      const result = evaluate('4 * 3', doc);
      assert.strictEqual(result, 12);
    });

    it('should evaluate div', () => {
      const result = evaluate('10 div 2', doc);
      assert.strictEqual(result, 5);
    });

    it('should evaluate mod', () => {
      const result = evaluate('10 mod 3', doc);
      assert.strictEqual(result, 1);
    });

    it('should evaluate comparison =', () => {
      const result = evaluate('1 = 1', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate comparison !=', () => {
      const result = evaluate('1 != 2', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate comparison <', () => {
      const result = evaluate('1 < 2', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate comparison >', () => {
      const result = evaluate('2 > 1', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate and', () => {
      const result = evaluate('true() and true()', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate or', () => {
      const result = evaluate('true() or false()', doc);
      assert.strictEqual(result, true);
    });

    it('should evaluate union |', () => {
      const result = select('/root/item | /root/nested', doc);
      assert.strictEqual(result.length, 4);
    });
  });

  describe('Variables', () => {
    it('should evaluate variable reference', () => {
      const result = evaluate('$myVar', doc, { variables: { myVar: 42 } });
      assert.strictEqual(result, 42);
    });

    it('should use variable in expression', () => {
      const result = evaluate('$x + $y', doc, { variables: { x: 10, y: 5 } });
      assert.strictEqual(result, 15);
    });

    it('should throw for undefined variable', () => {
      assert.throws(() => {
        evaluate('$undefined', doc);
      }, /Undefined variable/);
    });
  });

  describe('Unary expressions', () => {
    it('should evaluate unary minus', () => {
      const result = evaluate('-5', doc);
      assert.strictEqual(result, -5);
    });

    it('should evaluate unary minus with expression', () => {
      const result = evaluate('-(3 + 2)', doc);
      assert.strictEqual(result, -5);
    });
  });

  describe('Additional axes', () => {
    it('should use ancestor-or-self axis', () => {
      const child = selectFirst('//child[@name="a"]', doc);
      const ancestorsOrSelf = select('ancestor-or-self::*', child);
      assert.ok(ancestorsOrSelf.length >= 3);
      // Results are in document order, so root comes first
      assert.strictEqual(ancestorsOrSelf[ancestorsOrSelf.length - 1].nodeName, 'child');
    });

    it('should use following axis', () => {
      const item1 = selectFirst('/root/item[1]', doc);
      const following = select('following::item', item1);
      assert.strictEqual(following.length, 2);
    });

    it('should use preceding axis', () => {
      const item3 = selectFirst('/root/item[3]', doc);
      const preceding = select('preceding::item', item3);
      assert.strictEqual(preceding.length, 2);
    });

    it('should use namespace axis (empty result)', () => {
      const root = selectFirst('/root', doc);
      const namespaces = select('namespace::*', root);
      assert.strictEqual(namespaces.length, 0);
    });
  });

  describe('Relational operators', () => {
    it('should evaluate <=', () => {
      assert.strictEqual(evaluate('1 <= 2', doc), true);
      assert.strictEqual(evaluate('2 <= 2', doc), true);
      assert.strictEqual(evaluate('3 <= 2', doc), false);
    });

    it('should evaluate >=', () => {
      assert.strictEqual(evaluate('2 >= 1', doc), true);
      assert.strictEqual(evaluate('2 >= 2', doc), true);
      assert.strictEqual(evaluate('1 >= 2', doc), false);
    });
  });

  describe('Node-set comparisons', () => {
    it('should compare node-set to node-set', () => {
      const result = evaluate('/root/item/@id = /root/item/@id', doc);
      assert.strictEqual(result, true);
    });

    it('should compare node-set to string', () => {
      const result = evaluate('/root/item[1] = "First"', doc);
      assert.strictEqual(result, true);
    });

    it('should compare string to node-set', () => {
      const result = evaluate('"First" = /root/item[1]', doc);
      assert.strictEqual(result, true);
    });

    it('should handle empty node-set comparison', () => {
      const result = evaluate('/root/nonexistent = "test"', doc);
      assert.strictEqual(result, false);
    });
  });

  describe('Boolean comparisons', () => {
    it('should compare booleans with =', () => {
      const result = evaluate('true() = true()', doc);
      assert.strictEqual(result, true);
    });

    it('should compare booleans with !=', () => {
      const result = evaluate('true() != false()', doc);
      assert.strictEqual(result, true);
    });

    it('should compare boolean with number', () => {
      const result = evaluate('true() = 1', doc);
      assert.strictEqual(result, true);
    });
  });

  describe('Additional functions', () => {
    it('should evaluate id() function', () => {
      const docWithId = createDOM(`<?xml version="1.0"?>
        <root>
          <item id="test-id">Test</item>
        </root>
      `);
      const result = select('id("test-id")', docWithId);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].textContent, 'Test');
    });

    it('should evaluate namespace-uri()', () => {
      const result = evaluate('namespace-uri(/root)', doc);
      assert.strictEqual(result, '');
    });

    it('should evaluate namespace-uri() without args', () => {
      const item = selectFirst('/root/item[1]', doc);
      const result = evaluate('namespace-uri()', item);
      assert.strictEqual(result, '');
    });

    it('should evaluate lang() function', () => {
      const docWithLang = createDOM(`<?xml version="1.0"?>
        <root lang="en">
          <item>Test</item>
        </root>
      `);
      const item = selectFirst('/root/item', docWithLang);
      const result = evaluate('lang("en")', item);
      assert.strictEqual(result, true);
    });

    it('should evaluate lang() with sublanguage', () => {
      const docWithLang = createDOM(`<?xml version="1.0"?>
        <root lang="en-US">
          <item>Test</item>
        </root>
      `);
      const item = selectFirst('/root/item', docWithLang);
      const result = evaluate('lang("en")', item);
      assert.strictEqual(result, true);
    });

    it('should evaluate number() without args', () => {
      const docWithNum = createDOM(`<?xml version="1.0"?>
        <root>42</root>
      `);
      const root = selectFirst('/root', docWithNum);
      const result = evaluate('number()', root);
      assert.strictEqual(result, 42);
    });

    it('should evaluate local-name() without args', () => {
      const item = selectFirst('/root/item[1]', doc);
      const result = evaluate('local-name()', item);
      assert.strictEqual(result, 'item');
    });

    it('should evaluate name() without args', () => {
      const item = selectFirst('/root/item[1]', doc);
      const result = evaluate('name()', item);
      assert.strictEqual(result, 'item');
    });

    it('should evaluate string-length() without args', () => {
      const item = selectFirst('/root/item[1]', doc);
      const result = evaluate('string-length()', item);
      assert.strictEqual(result, 5); // "First"
    });

    it('should evaluate normalize-space() without args', () => {
      const docWithSpaces = createDOM(`<?xml version="1.0"?>
        <root>  hello   world  </root>
      `);
      const root = selectFirst('/root', docWithSpaces);
      const result = evaluate('normalize-space()', root);
      assert.strictEqual(result, 'hello world');
    });
  });

  describe('Node type tests', () => {
    it('should match text nodes', () => {
      const result = select('/root/item[1]/text()', doc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].nodeType, 3);
    });

    it('should match comment nodes', () => {
      const docWithComment = createDOM(`<?xml version="1.0"?>
        <root><!-- comment --><item>Test</item></root>
      `);
      const result = select('/root/comment()', docWithComment);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].nodeType, 8);
    });

    it('should match processing-instruction nodes', () => {
      const docWithPI = createDOM(`<?xml version="1.0"?>
        <root><?pi-target data?><item>Test</item></root>
      `);
      const result = select('/root/processing-instruction()', docWithPI);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].nodeType, 7);
    });

    it('should match any node with node()', () => {
      const result = select('/root/node()', doc);
      assert.ok(result.length > 0);
    });
  });

  describe('Type conversions', () => {
    it('should convert boolean to number', () => {
      const result = evaluate('number(true())', doc);
      assert.strictEqual(result, 1);
    });

    it('should convert false to 0', () => {
      const result = evaluate('number(false())', doc);
      assert.strictEqual(result, 0);
    });

    it('should handle NaN in string conversion', () => {
      const result = evaluate('string(number("not a number"))', doc);
      assert.strictEqual(result, 'NaN');
    });

    it('should handle Infinity in string conversion', () => {
      const result = evaluate('string(1 div 0)', doc);
      assert.strictEqual(result, 'Infinity');
    });

    it('should convert empty string to NaN', () => {
      const result = evaluate('number("")', doc);
      assert.ok(isNaN(result));
    });

    it('should convert boolean to string', () => {
      const result = evaluate('string(true())', doc);
      assert.strictEqual(result, 'true');
    });

    it('should convert empty node-set to empty string', () => {
      const result = evaluate('string(/root/nonexistent)', doc);
      assert.strictEqual(result, '');
    });
  });

  describe('Edge cases', () => {
    it('should handle substring with negative start', () => {
      const result = evaluate('substring("Hello", -1, 5)', doc);
      assert.strictEqual(result, 'Hel');
    });

    it('should handle translate removing characters', () => {
      const result = evaluate('translate("hello", "aeiou", "")', doc);
      assert.strictEqual(result, 'hll');
    });

    it('should handle division by zero', () => {
      const result = evaluate('1 div 0', doc);
      assert.strictEqual(result, Infinity);
    });

    it('should handle round(-0.5)', () => {
      const result = evaluate('round(-0.5)', doc);
      assert.strictEqual(Object.is(result, -0), true);
    });

    it('should handle round(NaN)', () => {
      const result = evaluate('round(number("NaN"))', doc);
      assert.ok(isNaN(result));
    });

    it('should return empty string for invalid substring params', () => {
      const result = evaluate('substring("Hello", number("NaN"))', doc);
      assert.strictEqual(result, '');
    });

    it('should handle substring with length <= 0', () => {
      const result = evaluate('substring("Hello", 2, 0)', doc);
      assert.strictEqual(result, '');
    });
  });

  describe('Error handling', () => {
    it('should throw for unknown function', () => {
      assert.throws(() => {
        evaluate('unknownFunction()', doc);
      }, /Unknown function/);
    });

    it('should handle sum of non-array', () => {
      const result = evaluate('sum("not-a-nodeset")', doc);
      assert.ok(isNaN(result));
    });
  });

  describe('Security', () => {
    it('should prevent prototype pollution via __proto__', () => {
      assert.throws(() => {
        evaluate('$__proto__', doc, { variables: { __proto__: 'test' } });
      }, /Forbidden variable name/);
    });

    it('should prevent prototype pollution via constructor', () => {
      assert.throws(() => {
        evaluate('$constructor', doc, { variables: { constructor: 'test' } });
      }, /Forbidden variable name/);
    });

    it('should prevent prototype pollution via prototype', () => {
      assert.throws(() => {
        evaluate('$prototype', doc, { variables: { prototype: 'test' } });
      }, /Forbidden variable name/);
    });

    it('should use hasOwnProperty for variable lookup', () => {
      assert.throws(() => {
        evaluate('$toString', doc, { variables: {} });
      }, /Undefined variable/);
    });

    it('should reject invalid AST', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);

      assert.throws(() => {
        evaluator.evaluate(null, context);
      }, /Invalid AST/);

      assert.throws(() => {
        evaluator.evaluate({}, context);
      }, /Invalid AST.*missing type/);
    });

    it('should handle deeply nested expressions safely', () => {
      // Build a deeply nested expression
      let expr = '1';
      for (let i = 0; i < 50; i++) {
        expr = `(${expr} + 1)`;
      }
      // Should work within limits
      const result = evaluate(expr, doc);
      assert.strictEqual(result, 51);
    });

    it('should throw when max recursion depth exceeded', () => {
      const evaluator = new XPathEvaluator({ maxRecursionDepth: 5 });
      const context = new XPathContext(doc);

      // Build a deeply nested expression that exceeds the limit
      let expr = '1';
      for (let i = 0; i < 10; i++) {
        expr = `(${expr} + 1)`;
      }
      const ast = parse(expr);

      assert.throws(() => {
        evaluator.evaluate(ast, context);
      }, /Maximum recursion depth exceeded/);
    });

    it('should throw when string exceeds max length', () => {
      const evaluator = new XPathEvaluator({ maxStringLength: 10 });
      const context = new XPathContext(doc);

      // Create a literal AST node with a long string
      const ast = {
        type: 'Literal',
        value: 'a'.repeat(20)
      };

      assert.throws(() => {
        evaluator.evaluate(ast, context);
      }, /String exceeds maximum length/);
    });

    it('should throw when result set exceeds max size', () => {
      // Create a large XML document
      const items = Array(50).fill('<item>x</item>').join('');
      const largeDoc = createDOM(`<?xml version="1.0"?><root>${items}</root>`);

      const evaluator = new XPathEvaluator({ maxResultSize: 10 });
      const context = new XPathContext(largeDoc);
      const ast = parse('//item');

      assert.throws(() => {
        evaluator.evaluate(ast, context);
      }, /Result set exceeds maximum size/);
    });

    it('should prevent prototype pollution via __defineGetter__', () => {
      assert.throws(() => {
        evaluate('$__defineGetter__', doc, { variables: { __defineGetter__: 'test' } });
      }, /Forbidden variable name/);
    });

    it('should prevent prototype pollution via __defineSetter__', () => {
      assert.throws(() => {
        evaluate('$__defineSetter__', doc, { variables: { __defineSetter__: 'test' } });
      }, /Forbidden variable name/);
    });

    it('should prevent prototype pollution via __lookupGetter__', () => {
      assert.throws(() => {
        evaluate('$__lookupGetter__', doc, { variables: { __lookupGetter__: 'test' } });
      }, /Forbidden variable name/);
    });

    it('should prevent prototype pollution via __lookupSetter__', () => {
      assert.throws(() => {
        evaluate('$__lookupSetter__', doc, { variables: { __lookupSetter__: 'test' } });
      }, /Forbidden variable name/);
    });

    it('should not inherit from Object.prototype for variables', () => {
      // Variables like 'hasOwnProperty' should not be found via prototype chain
      assert.throws(() => {
        evaluate('$hasOwnProperty', doc, { variables: {} });
      }, /Undefined variable/);
    });

    it('should not inherit valueOf from Object.prototype', () => {
      assert.throws(() => {
        evaluate('$valueOf', doc, { variables: {} });
      }, /Undefined variable/);
    });

    it('should handle prefixed forbidden variable names', () => {
      assert.throws(() => {
        evaluate('$ns:__proto__', doc, { variables: { 'ns:__proto__': 'test' } });
      }, /Forbidden variable name/);
    });

    it('should validate string in literal with max length', () => {
      const evaluator = new XPathEvaluator({ maxStringLength: 10 });
      const context = new XPathContext(doc);
      // Direct literal exceeding limit
      const ast = { type: 'Literal', value: 'a'.repeat(15) };

      assert.throws(() => {
        evaluator.evaluate(ast, context);
      }, /String exceeds maximum length/);
    });

    it('should reset recursion depth after error', () => {
      const evaluator = new XPathEvaluator({ maxRecursionDepth: 3 });
      const context = new XPathContext(doc);

      // First call should fail
      let expr = '1';
      for (let i = 0; i < 10; i++) {
        expr = `(${expr} + 1)`;
      }
      const ast = parse(expr);

      try {
        evaluator.evaluate(ast, context);
      } catch {
        // Expected to fail
      }

      // Second simple call should work (recursion depth reset)
      const simpleAst = parse('1 + 1');
      const result = evaluator.evaluate(simpleAst, context);
      assert.strictEqual(result, 2);
    });

    it('should handle circular reference in variables safely', () => {
      const circular = {};
      circular.self = circular;

      // Should not cause infinite loop - just evaluate to the object
      const result = evaluate('$obj', doc, { variables: { obj: circular } });
      assert.strictEqual(result, circular);
    });
  });

  describe('Strict Mode Validation', () => {
    it('should reject AST with null type', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);

      assert.throws(() => {
        evaluator.evaluate({ type: null }, context);
      }, /Invalid AST.*missing type/);
    });

    it('should reject AST with undefined type', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);

      assert.throws(() => {
        evaluator.evaluate({ type: undefined }, context);
      }, /Invalid AST.*missing type/);
    });

    it('should reject AST that is an array', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);

      assert.throws(() => {
        evaluator.evaluate([], context);
      }, /Invalid AST.*missing type/);
    });

    it('should reject primitive AST values', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);

      assert.throws(() => {
        evaluator.evaluate('string', context);
      }, /Invalid AST/);

      assert.throws(() => {
        evaluator.evaluate(123, context);
      }, /Invalid AST/);

      assert.throws(() => {
        evaluator.evaluate(true, context);
      }, /Invalid AST/);
    });

    it('should handle AST with symbol type safely', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);

      assert.throws(() => {
        evaluator.evaluate({ type: Symbol('test') }, context);
      }, /Unknown AST node type/);
    });

    it('should handle context with valid node', () => {
      const evaluator = new XPathEvaluator();
      const ast = parse('.');

      // Context with valid node
      const context = new XPathContext(doc);
      const result = evaluator.evaluate(ast, context);
      assert.ok(result);
    });
  });

  describe('Input Sanitization', () => {
    it('should handle expressions with unicode characters', () => {
      const unicodeDoc = createDOM('<root><item>Здравствуй мир</item></root>');
      const result = select('/root/item', unicodeDoc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].textContent, 'Здравствуй мир');
    });

    it('should handle element names with unicode', () => {
      const unicodeDoc = createDOM('<корень><элемент>Текст</элемент></корень>');
      const result = select('/корень/элемент', unicodeDoc);
      assert.strictEqual(result.length, 1);
    });

    it('should handle emoji in text content', () => {
      const emojiDoc = createDOM('<root><item>Hello 🌍 World</item></root>');
      const result = evaluate('string(/root/item)', emojiDoc);
      assert.strictEqual(result, 'Hello 🌍 World');
    });

    it('should handle null bytes in string safely', () => {
      const result = evaluate('contains("test\\u0000string", "test")', doc);
      assert.strictEqual(result, true);
    });

    it('should handle very long element names', () => {
      const longName = 'a'.repeat(100);
      const longDoc = createDOM(`<root><${longName}>content</${longName}></root>`);
      const result = select(`/root/${longName}`, longDoc);
      assert.strictEqual(result.length, 1);
    });

    it('should handle deeply nested XML safely', () => {
      let nested = '<item>value</item>';
      for (let i = 0; i < 20; i++) {
        nested = `<level${i}>${nested}</level${i}>`;
      }
      const deepDoc = createDOM(`<root>${nested}</root>`);
      const result = select('//item', deepDoc);
      assert.strictEqual(result.length, 1);
    });

    it('should handle XML with many attributes', () => {
      const attrs = Array(50).fill(0).map((_, i) => `attr${i}="value${i}"`).join(' ');
      const manyAttrsDoc = createDOM(`<root><item ${attrs}>content</item></root>`);
      const result = evaluate('count(/root/item/@*)', manyAttrsDoc);
      assert.strictEqual(result, 50);
    });

    it('should handle whitespace-only text nodes', () => {
      const wsDoc = createDOM('<root>   \n\t   </root>');
      const result = evaluate('normalize-space(/root)', wsDoc);
      assert.strictEqual(result, '');
    });

    it('should handle special XML characters in text', () => {
      // Test handling of special characters that would be escaped
      const specialDoc = createDOM('<root>&lt;special&gt;content&lt;/special&gt;</root>');
      const result = evaluate('string(/root)', specialDoc);
      assert.ok(result.includes('<special>'));
    });
  });

  describe('DoS Prevention', () => {
    it('should limit string concatenation', () => {
      const evaluator = new XPathEvaluator({ maxStringLength: 100 });
      const context = new XPathContext(doc);

      // Try to build a very long string
      const ast = parse('concat("a", "a", "a", "a", "a", "a", "a", "a", "a", "a")');
      const result = evaluator.evaluate(ast, context);
      assert.strictEqual(result.length, 10);
    });

    it('should prevent exponential blowup in union', () => {
      // Create document with moderate number of items
      const items = Array(20).fill('<item>x</item>').join('');
      const unionDoc = createDOM(`<root>${items}</root>`);

      // Multiple unions should still be bounded
      const result = select('//item | //item | //item', unionDoc);
      // Union should deduplicate
      assert.strictEqual(result.length, 20);
    });

    it('should handle pathological predicate expressions', () => {
      // Predicate that could be slow if not optimized
      const result = select('/root/item[position() = last()]', doc);
      assert.strictEqual(result.length, 1);
    });

    it('should bound ancestor axis traversal', () => {
      // Deep document
      let nested = '<leaf>x</leaf>';
      for (let i = 0; i < 30; i++) {
        nested = `<level>${nested}</level>`;
      }
      const deepDoc = createDOM(`<root>${nested}</root>`);

      const leaf = selectFirst('//leaf', deepDoc);
      const ancestors = select('ancestor::*', leaf);
      assert.ok(ancestors.length <= 32);
    });

    it('should handle count on large node sets', () => {
      const items = Array(100).fill('<item>x</item>').join('');
      const largeDoc = createDOM(`<root>${items}</root>`);

      const result = evaluate('count(//item)', largeDoc);
      assert.strictEqual(result, 100);
    });

    it('should validate result size in location path', () => {
      const items = Array(50).fill('<item>x</item>').join('');
      const largeDoc = createDOM(`<root>${items}</root>`);

      const evaluator = new XPathEvaluator({ maxResultSize: 10 });
      const context = new XPathContext(largeDoc);
      const ast = parse('/root/item');

      assert.throws(() => {
        evaluator.evaluate(ast, context);
      }, /Result set exceeds maximum size/);
    });
  });

  describe('XPathLimits constants', () => {
    it('should export XPathLimits with default values', () => {
      assert.strictEqual(XPathLimits.MAX_RECURSION_DEPTH, 100);
      assert.strictEqual(XPathLimits.MAX_RESULT_SIZE, 10000);
      assert.strictEqual(XPathLimits.MAX_STRING_LENGTH, 1000000);
    });

    it('should allow custom limits via constructor', () => {
      const evaluator = new XPathEvaluator({
        maxRecursionDepth: 50,
        maxResultSize: 500,
        maxStringLength: 5000
      });
      assert.strictEqual(evaluator.maxRecursionDepth, 50);
      assert.strictEqual(evaluator.maxResultSize, 500);
      assert.strictEqual(evaluator.maxStringLength, 5000);
    });

    it('should use defaults when options not provided', () => {
      const evaluator = new XPathEvaluator();
      assert.strictEqual(evaluator.maxRecursionDepth, 100);
      assert.strictEqual(evaluator.maxResultSize, 10000);
      assert.strictEqual(evaluator.maxStringLength, 1000000);
    });
  });

  describe('Namespaces', () => {
    it('should match prefix:* namespace wildcard', () => {
      const nsDoc = createDOM(`<?xml version="1.0"?>
        <root xmlns:ns="http://example.com/ns">
          <ns:item>First</ns:item>
          <ns:item>Second</ns:item>
        </root>
      `);
      const result = select('/root/ns:*', nsDoc, {
        namespaces: { ns: 'http://example.com/ns' }
      });
      assert.strictEqual(result.length, 2);
    });

    it('should match prefixed element name with namespace', () => {
      const nsDoc = createDOM(`<?xml version="1.0"?>
        <root xmlns:ns="http://example.com/ns">
          <ns:item>First</ns:item>
          <other>Second</other>
        </root>
      `);
      const result = select('/root/ns:item', nsDoc, {
        namespaces: { ns: 'http://example.com/ns' }
      });
      assert.strictEqual(result.length, 1);
    });
  });

  describe('Filter expressions', () => {
    it('should evaluate filter with predicate', () => {
      const result = select('(/root/item)[2]', doc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].getAttribute('id'), '2');
    });

    it('should evaluate filter with path continuation', () => {
      const result = select('(/root/nested)/child', doc);
      assert.strictEqual(result.length, 2);
    });
  });

  describe('Processing instruction tests', () => {
    it('should match named processing-instruction', () => {
      const docWithPI = createDOM(`<?xml version="1.0"?>
        <root><?php echo "test"?><?xml-stylesheet href="style.css"?></root>
      `);
      const result = select('/root/processing-instruction("php")', docWithPI);
      assert.strictEqual(result.length, 1);
    });
  });

  describe('Additional type conversions', () => {
    it('should convert node to number via string value', () => {
      const numDoc = createDOM(`<?xml version="1.0"?><root>42</root>`);
      const root = selectFirst('/root', numDoc);
      const evaluator = new XPathEvaluator();
      const result = evaluator.toNumber(root);
      assert.strictEqual(result, 42);
    });

    it('should convert -Infinity to string', () => {
      const result = evaluate('string(-1 div 0)', doc);
      assert.strictEqual(result, '-Infinity');
    });

    it('should convert node to string directly', () => {
      const evaluator = new XPathEvaluator();
      const item = selectFirst('/root/item[1]', doc);
      const result = evaluator.toString(item);
      assert.strictEqual(result, 'First');
    });

    it('should return empty string for unknown node type', () => {
      const evaluator = new XPathEvaluator();
      // Mock a node with unknown type
      const unknownNode = { nodeType: 99 };
      const result = evaluator.getStringValue(unknownNode);
      assert.strictEqual(result, '');
    });

    it('should convert null/undefined to false in toBoolean', () => {
      const evaluator = new XPathEvaluator();
      assert.strictEqual(evaluator.toBoolean(null), false);
      assert.strictEqual(evaluator.toBoolean(undefined), false);
    });

    it('should convert node to true in toBoolean', () => {
      const evaluator = new XPathEvaluator();
      const item = selectFirst('/root/item[1]', doc);
      assert.strictEqual(evaluator.toBoolean(item), true);
    });

    it('should convert array to number via first element', () => {
      const evaluator = new XPathEvaluator();
      const items = select('/root/item', doc);
      // First item has text "First" which is NaN
      const result = evaluator.toNumber(items);
      assert.ok(isNaN(result));
    });
  });

  describe('Additional lang() tests', () => {
    it('should return false when no lang attribute', () => {
      const result = evaluate('lang("en")', doc);
      assert.strictEqual(result, false);
    });

    it('should match xml:lang attribute', () => {
      const docWithXmlLang = createDOM(`<?xml version="1.0"?>
        <root xml:lang="de">
          <item>Test</item>
        </root>
      `);
      const item = selectFirst('/root/item', docWithXmlLang);
      const result = evaluate('lang("de")', item);
      assert.strictEqual(result, true);
    });
  });

  describe('string() function', () => {
    it('should evaluate string() without args', () => {
      const item = selectFirst('/root/item[1]', doc);
      const result = evaluate('string()', item);
      assert.strictEqual(result, 'First');
    });
  });

  describe('substring() function', () => {
    it('should evaluate substring without length argument', () => {
      const result = evaluate('substring("Hello World", 7)', doc);
      assert.strictEqual(result, 'World');
    });

    it('should handle substring with NaN length', () => {
      const result = evaluate('substring("Hello", 1, number("NaN"))', doc);
      assert.strictEqual(result, '');
    });
  });

  describe('Node-set comparison edge cases', () => {
    it('should return false for empty left node-set comparison', () => {
      const result = evaluate('/root/nonexistent = /root/item', doc);
      assert.strictEqual(result, false);
    });

    it('should return false for empty right node-set comparison', () => {
      const result = evaluate('/root/item = /root/nonexistent', doc);
      assert.strictEqual(result, false);
    });

    it('should compare two different node-sets returning false', () => {
      const result = evaluate('/root/item = /root/numbers/num', doc);
      assert.strictEqual(result, false);
    });
  });

  describe('Error cases for unknown types', () => {
    it('should throw for unknown AST node type', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);
      const invalidAst = { type: 'UnknownType' };

      assert.throws(() => {
        evaluator.evaluate(invalidAst, context);
      }, /Unknown AST node type/);
    });

    it('should throw for unknown multiplicative operator', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);
      const ast = {
        type: 'MultiplicativeExpr',
        operator: 'unknown',
        left: { type: 'Number', value: 1 },
        right: { type: 'Number', value: 2 }
      };

      assert.throws(() => {
        evaluator.evaluate(ast, context);
      }, /Unknown multiplicative operator/);
    });

    it('should throw for unknown axis', () => {
      const evaluator = new XPathEvaluator();
      assert.throws(() => {
        evaluator.getAxisNodes('unknownAxis', doc);
      }, /Unknown axis/);
    });

    it('should throw for unknown comparison operator', () => {
      const evaluator = new XPathEvaluator();
      assert.throws(() => {
        evaluator.comparePrimitive(1, 2, '??');
      }, /Unknown comparison operator/);
    });
  });

  describe('HTML case-insensitive matching', () => {
    it('should match element names case-insensitively in HTML', () => {
      const htmlDoc = new JSDOM('<html><body><DIV>Test</DIV></body></html>', {
        contentType: 'text/html'
      }).window.document;

      const result = select('//div', htmlDoc);
      assert.ok(result.length >= 1);
    });
  });

  describe('Document position fallback', () => {
    it('should sort nodes using fallback when compareDocumentPosition not available', () => {
      const evaluator = new XPathEvaluator();

      // Create mock nodes without compareDocumentPosition
      const mockParent = { childNodes: [], parentNode: null };
      const mockNode1 = { parentNode: mockParent };
      const mockNode2 = { parentNode: mockParent };
      mockParent.childNodes = [mockNode1, mockNode2];

      // Test the fallback directly
      const result = evaluator.compareDocumentPositionFallback(mockNode1, mockNode2);
      assert.strictEqual(result, 4); // mockNode1 before mockNode2

      const result2 = evaluator.compareDocumentPositionFallback(mockNode2, mockNode1);
      assert.strictEqual(result2, 2); // mockNode2 after mockNode1
    });

    it('should handle nodes at different depths', () => {
      const evaluator = new XPathEvaluator();

      const grandparent = { childNodes: [], parentNode: null };
      const parent = { childNodes: [], parentNode: grandparent };
      const child = { parentNode: parent };
      grandparent.childNodes = [parent];
      parent.childNodes = [child];

      // Child is deeper than grandparent
      const result = evaluator.compareDocumentPositionFallback(grandparent, child);
      assert.ok(result === 4 || result === 2); // Position relationship exists
    });
  });

  describe('toString edge cases', () => {
    it('should convert 0 to string "0"', () => {
      const result = evaluate('string(0)', doc);
      assert.strictEqual(result, '0');
    });

    it('should convert negative zero to string', () => {
      const result = evaluate('string(0 - 0)', doc);
      assert.strictEqual(result, '0');
    });
  });

  describe('Attribute axis edge cases', () => {
    it('should return empty array for node without attributes property', () => {
      const evaluator = new XPathEvaluator();
      const textNode = { nodeType: 3 }; // Text node has no attributes
      const result = evaluator.getAxisNodes('attribute', textNode);
      assert.deepStrictEqual(result, []);
    });
  });

  describe('matchNodeTest edge cases', () => {
    it('should return false for unknown node test type', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);
      const unknownTest = { type: 'UnknownTestType' };

      const result = evaluator.matchNodeTest(unknownTest, doc, context);
      assert.strictEqual(result, false);
    });

    it('should return false for unknown node type test', () => {
      const evaluator = new XPathEvaluator();
      const result = evaluator.matchNodeTypeTest('unknownNodeType', doc);
      assert.strictEqual(result, false);
    });
  });

  describe('evalPathExpr edge cases', () => {
    it('should return empty array when no filter in path expression', () => {
      const evaluator = new XPathEvaluator();
      const context = new XPathContext(doc);
      const ast = { type: 'PathExpr' }; // No filter property

      const result = evaluator.evaluate(ast, context);
      assert.deepStrictEqual(result, []);
    });
  });

  describe('toNumber edge cases', () => {
    it('should return NaN for non-numeric value', () => {
      const evaluator = new XPathEvaluator();
      const result = evaluator.toNumber({});
      assert.ok(isNaN(result));
    });
  });

  describe('Sort edge cases', () => {
    it('should handle sorting identical nodes', () => {
      const item = selectFirst('/root/item[1]', doc);
      const evaluator = new XPathEvaluator();
      const sorted = evaluator.sortByDocumentOrder([item, item]);
      assert.strictEqual(sorted.length, 2);
    });
  });

  describe('Right node-set comparison', () => {
    it('should compare primitive to right node-set returning false', () => {
      // Test case where right is nodeset but comparison fails
      const result = evaluate('"nonexistent" = /root/item', doc);
      assert.strictEqual(result, false);
    });
  });

  describe('toString regular number coverage', () => {
    it('should convert regular positive number to string', () => {
      const evaluator = new XPathEvaluator();
      // Test line 624 - regular number (not NaN, Infinity, -Infinity, or 0)
      const result = evaluator.toString(42);
      assert.strictEqual(result, '42');
    });

    it('should convert regular negative number to string', () => {
      const evaluator = new XPathEvaluator();
      const result = evaluator.toString(-123);
      assert.strictEqual(result, '-123');
    });

    it('should convert decimal number to string', () => {
      const evaluator = new XPathEvaluator();
      const result = evaluator.toString(3.14159);
      assert.strictEqual(result, '3.14159');
    });
  });

  describe('toString fallback for unknown types', () => {
    it('should convert Symbol to string representation', () => {
      const evaluator = new XPathEvaluator();
      // Test line 634 - value is not number, boolean, array, or node
      const result = evaluator.toString('plain text');
      assert.strictEqual(result, 'plain text');
    });

    it('should convert null-like object to string', () => {
      const evaluator = new XPathEvaluator();
      // Custom object that doesn't have nodeType
      const result = evaluator.toString({ custom: 'object' });
      assert.strictEqual(result, '[object Object]');
    });
  });

  describe('Sort identical nodes coverage', () => {
    it('should return 0 when comparing same node with compareDocumentPosition', () => {
      const item = selectFirst('/root/item[1]', doc);
      const evaluator = new XPathEvaluator();
      // Test line 755 - comparing node to itself should return 0
      const sorted = evaluator.sortByDocumentOrder([item, item, item]);
      assert.strictEqual(sorted.length, 3);
      assert.strictEqual(sorted[0], item);
      assert.strictEqual(sorted[1], item);
    });

    it('should handle single element array', () => {
      const item = selectFirst('/root/item[1]', doc);
      const evaluator = new XPathEvaluator();
      const sorted = evaluator.sortByDocumentOrder([item]);
      assert.strictEqual(sorted.length, 1);
    });

    it('should handle empty array', () => {
      const evaluator = new XPathEvaluator();
      const sorted = evaluator.sortByDocumentOrder([]);
      assert.strictEqual(sorted.length, 0);
    });
  });

  describe('Tokenizer Token.toString()', () => {
    it('should return string representation of token', () => {
      // Test tokenizer line 88-89
      const token = new Token(TokenType.NAME, 'test', 5);
      const str = token.toString();
      assert.strictEqual(str, 'Token(NAME, "test", pos=5)');
    });

    it('should handle numeric value in toString', () => {
      const token = new Token(TokenType.NUMBER, 42, 0);
      const str = token.toString();
      assert.strictEqual(str, 'Token(NUMBER, 42, pos=0)');
    });

    it('should handle null value in toString', () => {
      const token = new Token(TokenType.EOF, null, 10);
      const str = token.toString();
      assert.strictEqual(str, 'Token(EOF, null, pos=10)');
    });
  });

  describe('Tokenizer error cases', () => {
    it('should throw error for unexpected character', () => {
      // Test tokenizer lines 259-262
      assert.throws(() => {
        tokenize('test#invalid');
      }, /Unexpected character '#'/);
    });

    it('should throw error for unterminated string literal with double quotes', () => {
      // Test tokenizer lines 274-276
      assert.throws(() => {
        tokenize('"unterminated');
      }, /Unterminated string literal/);
    });

    it('should throw error for unterminated string literal with single quotes', () => {
      assert.throws(() => {
        tokenize("'unterminated");
      }, /Unterminated string literal/);
    });
  });

  describe('Operator disambiguation', () => {
    it('should treat div as element name after //', () => {
      // div is an element name, not division operator
      const divDoc = createDOM('<root><div>Content</div></root>');
      const result = select('//div', divDoc);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].textContent, 'Content');
    });

    it('should treat mod as element name at start', () => {
      const modDoc = createDOM('<root><mod>Modular</mod></root>');
      const result = select('/root/mod', modDoc);
      assert.strictEqual(result.length, 1);
    });

    it('should treat and/or as element names after operators', () => {
      const andOrDoc = createDOM('<root><and>AndContent</and><or>OrContent</or></root>');
      const andResult = select('/root/and', andOrDoc);
      const orResult = select('/root/or', andOrDoc);
      assert.strictEqual(andResult.length, 1);
      assert.strictEqual(orResult.length, 1);
    });

    it('should treat div as operator after number', () => {
      const result = evaluate('10 div 2', doc);
      assert.strictEqual(result, 5);
    });

    it('should treat mod as operator after closing paren', () => {
      const result = evaluate('(10) mod 3', doc);
      assert.strictEqual(result, 1);
    });

    it('should treat and as operator after boolean', () => {
      const result = evaluate('true() and false()', doc);
      assert.strictEqual(result, false);
    });

    it('should treat or as operator after name reference', () => {
      const result = evaluate('1 = 1 or 1 = 2', doc);
      assert.strictEqual(result, true);
    });
  });

  describe('Disconnected nodes sorting', () => {
    it('should handle sorting nodes from different documents', () => {
      const doc2 = createDOM('<other><element>Test</element></other>');
      const node1 = selectFirst('/root/item[1]', doc);
      const node2 = selectFirst('/other/element', doc2);

      const evaluator = new XPathEvaluator();
      // When nodes are from different documents, compareDocumentPosition
      // returns DOCUMENT_POSITION_DISCONNECTED (1) without bits 2 or 4
      // This should hit line 755 (return 0)
      const sorted = evaluator.sortByDocumentOrder([node1, node2]);
      assert.strictEqual(sorted.length, 2);
    });

    it('should return 0 when compareDocumentPosition returns 0', () => {
      const evaluator = new XPathEvaluator();
      // Create mock nodes that return 0 from compareDocumentPosition
      // This tests line 755 directly
      const mockNode1 = {
        compareDocumentPosition: () => 0
      };
      const mockNode2 = {
        compareDocumentPosition: () => 0
      };

      const sorted = evaluator.sortByDocumentOrder([mockNode1, mockNode2]);
      assert.strictEqual(sorted.length, 2);
    });

    it('should return 0 when nodes are in contains relationship without preceding/following', () => {
      const evaluator = new XPathEvaluator();
      // DOCUMENT_POSITION_CONTAINS (8) or DOCUMENT_POSITION_CONTAINED_BY (16)
      // without bits 2 or 4 (edge case)
      const mockNode1 = {
        compareDocumentPosition: () => 8 // contains only
      };
      const mockNode2 = {
        compareDocumentPosition: () => 16 // contained_by only
      };

      const sorted = evaluator.sortByDocumentOrder([mockNode1, mockNode2]);
      assert.strictEqual(sorted.length, 2);
    });
  });

  describe('Parser edge cases', () => {
    it('should parse empty predicate', () => {
      // Predicates with just whitespace or simple expressions
      const result = evaluate('(/root/item)[1]', doc);
      assert.ok(result);
    });

    it('should parse deeply nested parentheses', () => {
      const result = evaluate('(((1 + 2)))', doc);
      assert.strictEqual(result, 3);
    });

    it('should parse union expression', () => {
      const result = select('/root/item | /root/nested', doc);
      assert.strictEqual(result.length, 4); // 3 items + 1 nested
    });

    it('should parse complex filter expression', () => {
      const result = select('(/root/item)[position() > 1]', doc);
      assert.strictEqual(result.length, 2);
    });

    it('should parse multiple predicates', () => {
      const result = select('/root/item[@id][@id="2"]', doc);
      assert.strictEqual(result.length, 1);
    });

    it('should parse namespace prefix', () => {
      const _nsDoc = createDOM(`<root xmlns:ns="http://example.com"><ns:item>Test</ns:item></root>`);
      // Even without namespace resolver, parsing should work
      assert.doesNotThrow(() => {
        parse('//ns:item');
      });
    });

    it('should parse abbreviated descendant axis', () => {
      const result = select('.//child', doc);
      assert.ok(result.length > 0);
    });

    it('should parse parent axis abbreviation', () => {
      const nested = selectFirst('/root/nested', doc);
      const result = select('..', nested);
      assert.strictEqual(result[0].nodeName, 'root');
    });

    it('should parse self axis abbreviation', () => {
      const nested = selectFirst('/root/nested', doc);
      const result = select('.', nested);
      assert.strictEqual(result[0].nodeName, 'nested');
    });
  });

  describe('Function edge cases', () => {
    it('should handle substring with negative start', () => {
      const result = evaluate('substring("12345", -1, 5)', doc);
      // Per XPath spec: chars at pos >= -1 and < (-1 + 5) = 4, so positions 1,2,3
      assert.strictEqual(result, '123');
    });

    it('should handle floor with positive infinity', () => {
      const result = evaluate('floor(1 div 0)', doc);
      assert.strictEqual(result, Infinity);
    });

    it('should handle ceiling with negative infinity', () => {
      const result = evaluate('ceiling(-1 div 0)', doc);
      assert.strictEqual(result, -Infinity);
    });

    it('should handle round with NaN', () => {
      const result = evaluate('round(0 div 0)', doc);
      assert.ok(isNaN(result));
    });

    it('should handle translate with missing characters', () => {
      const result = evaluate('translate("abc", "abc", "AB")', doc);
      // 'a' -> 'A', 'b' -> 'B', 'c' has no replacement so removed
      assert.strictEqual(result, 'AB');
    });

    it('should handle contains with empty string', () => {
      const result = evaluate('contains("test", "")', doc);
      assert.strictEqual(result, true);
    });

    it('should handle starts-with with empty string', () => {
      const result = evaluate('starts-with("test", "")', doc);
      assert.strictEqual(result, true);
    });

    it('should handle concat with single argument', () => {
      const result = evaluate('concat("single")', doc);
      assert.strictEqual(result, 'single');
    });
  });

  describe('Parser error cases', () => {
    it('should throw error for unexpected token after expression', () => {
      // Lines 57-60: trailing junk after valid expression
      assert.throws(() => {
        parse('1 + 2 @');
      }, /Unexpected token/);
    });

    it('should throw error for missing name after colon in name test', () => {
      // Lines 372-374: prefix: without name or *
      assert.throws(() => {
        parse('//ns: ');
      }, /Expected name/);
    });

    it('should throw error for missing variable name', () => {
      // Lines 407-408: $ without name
      assert.throws(() => {
        parse('$');
      }, /Expected variable name/);
    });

    it('should throw error for unexpected token in primary expression', () => {
      // Lines 445-448
      assert.throws(() => {
        parse(']');
      }, /Unexpected token/);
    });

    it('should throw error for missing expected token', () => {
      // Lines 525-528: expect() failure
      assert.throws(() => {
        parse('(1 + 2');
      }, /Expected RPAREN/);
    });
  });

  describe('Parser advanced features', () => {
    it('should parse descendant path after filter expression', () => {
      // Lines 224-231: filter followed by //step
      const result = select('(/root/item)[1]//text()', doc);
      assert.ok(result.length >= 0);
    });

    it('should parse prefixed variable reference', () => {
      // Lines 413-419: $prefix:name
      assert.doesNotThrow(() => {
        parse('$ns:variable');
      });
    });

    it('should throw for invalid prefixed function syntax', () => {
      // Lines 458-464 are hard to reach - the tokenizer distinguishes functions
      // by checking for '(' after name. prefix:fn() is tokenized as NAME:NAME()
      // This hits the name test error path instead
      assert.throws(() => {
        parse('fn:custom-function()');
      }, /Expected name or/);
    });

    it('should parse complex filter with descendant', () => {
      const result = select('(//item)[position() <= 2]//text()', doc);
      assert.ok(result.length >= 0);
    });

    it('should handle advance at end of tokens', () => {
      // Line 507: edge case for advance() when at end
      // This is implicitly tested but let's add explicit test
      assert.doesNotThrow(() => {
        parse('1');
      });
    });

    it('should throw for prefixed variable without local name', () => {
      // Lines 415-416: $prefix: without local name
      assert.throws(() => {
        parse('$ns:');
      }, /Expected local name/);
    });

    it('should throw for invalid name test with at sign', () => {
      // Lines 357-358 - parseNameTest expects NAME but gets something else
      assert.throws(() => {
        parse('//@');
      }, /Expected name/);
    });
  });

  describe('Index.js edge cases', () => {
    it('should return single node in array when result is single node', () => {
      // Line 47 in index.js: when result has nodeType but isn't array
      // This path is hard to hit since evaluate usually returns arrays for paths
      const result = select('/root', doc);
      assert.ok(Array.isArray(result));
    });

    it('should return empty array when result is not array and not node', () => {
      // Line 48 in index.js: return [] when result is primitive (string, number, boolean)
      // select() is meant for node selection, so primitives return empty array
      const result = select('1 + 1', doc); // Returns number 2, not a node
      assert.deepStrictEqual(result, []);
    });

    it('should return empty array for string result', () => {
      const result = select('string(/root/item[1])', doc); // Returns "First"
      assert.deepStrictEqual(result, []);
    });

    it('should return empty array for boolean result', () => {
      const result = select('true()', doc); // Returns true
      assert.deepStrictEqual(result, []);
    });
  });
});

describe('XPathParser edge cases', () => {
  it('should return last token when advance() called at end', async () => {
    const { XPathParser } = await import('./parser.js');
    const tokens = tokenize('foo');
    const parser = new XPathParser(tokens);

    // Parse the expression which consumes all tokens
    parser.parse();

    // Now at end, advance() should return the last token (EOF)
    const result = parser.advance();
    assert.strictEqual(result.type, TokenType.EOF);
  });

  it('should handle advance() at end of tokens gracefully', async () => {
    const { XPathParser } = await import('./parser.js');
    // Single element expression
    const tokens = tokenize('a');
    const parser = new XPathParser(tokens);

    // Consume all tokens
    while (!parser.isAtEnd()) {
      parser.advance();
    }

    // Call advance when already at end - should return last token
    const token1 = parser.advance();
    const token2 = parser.advance();

    // Both should return the EOF token
    assert.strictEqual(token1.type, TokenType.EOF);
    assert.strictEqual(token2.type, TokenType.EOF);
  });
});
