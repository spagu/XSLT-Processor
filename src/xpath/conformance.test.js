/**
 * XPath 1.0 conformance tests.
 *
 * Each block covers one rule of the XPath 1.0 recommendation that the
 * evaluator used to get wrong: existential `!=`, node-set/boolean comparison,
 * the XML whitespace set, the Number grammar of `number()`, the decimal form of
 * `string()`, prefixed function calls, the predeclared `xml` prefix, the
 * attribute axis without namespace declarations, merged text/CDATA nodes and
 * code point based string functions.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import {
  evaluate,
  select,
  XPathEvaluator,
  tokenize,
  TokenType,
} from "./index.js";

/**
 * Parse an XML document.
 *
 * @param {string} xml - Document source
 * @returns {Document} The document
 */
function xmlDoc(xml) {
  return new JSDOM(xml, { contentType: "application/xml" }).window.document;
}

/**
 * Evaluate an expression and convert the result with `string()`.
 *
 * @param {string} expression - XPath expression
 * @param {Node} node - Context node
 * @param {object} [options] - Variables and namespaces
 * @returns {string} The string value of the result
 */
function str(expression, node, options) {
  return new XPathEvaluator().toString(evaluate(expression, node, options));
}

describe("XPath conformance: equality with node-sets (3.4)", () => {
  const doc = xmlDoc(`<r><p n="1"/><p n="2"/><q n="1"/><s n="3"/></r>`);

  it("treats != on a node-set existentially", () => {
    assert.strictEqual(evaluate("r/p/@n != 1", doc), true);
    assert.strictEqual(evaluate("1 != r/p/@n", doc), true);
    assert.strictEqual(evaluate("r/q/@n != 1", doc), false);
    assert.strictEqual(evaluate("r/p/@n != '1'", doc), true);
    assert.strictEqual(evaluate("r/nothing != 1", doc), false);
  });

  it("treats != between two node-sets existentially over pairs", () => {
    assert.strictEqual(evaluate("r/p/@n != r/q/@n", doc), true);
    assert.strictEqual(evaluate("r/q/@n != r/q/@n", doc), false);
    assert.strictEqual(evaluate("r/p/@n = r/s/@n", doc), false);
  });

  it("compares a node-set with a boolean through boolean()", () => {
    assert.strictEqual(evaluate("r/p = true()", doc), true);
    assert.strictEqual(evaluate("true() = r/p", doc), true);
    assert.strictEqual(evaluate("r/nothing = false()", doc), true);
    assert.strictEqual(evaluate("false() = r/nothing", doc), true);
    assert.strictEqual(evaluate("r/p != true()", doc), false);
    assert.strictEqual(evaluate("true() != r/nothing", doc), true);
  });
});

describe("XPath conformance: XML whitespace only", () => {
  const doc = xmlDoc("<r/>");

  it("keeps non-breaking spaces in normalize-space()", () => {
    assert.strictEqual(evaluate("normalize-space(' a  b')", doc), " a  b");
    assert.strictEqual(
      evaluate("normalize-space(' \t\r\na \n b ')", doc),
      "a b",
    );
  });

  it("does not trim non-XML whitespace in number()", () => {
    assert.ok(Number.isNaN(evaluate("number(' 5')", doc)));
    assert.strictEqual(evaluate("number(' \t\n5\r ')", doc), 5);
  });
});

describe("XPath conformance: number() grammar (4.4)", () => {
  const doc = xmlDoc("<r/>");

  it("rejects strings outside the XPath Number grammar", () => {
    for (const s of [
      "1e3",
      "0x10",
      "+5",
      "Infinity",
      "1_000",
      "",
      " ",
      "-",
      ".",
      "1.2.3",
      "- 1",
    ]) {
      assert.ok(Number.isNaN(evaluate(`number('${s}')`, doc)), s);
    }
  });

  it("accepts every form of the grammar", () => {
    assert.strictEqual(evaluate("number(' -3.5 ')", doc), -3.5);
    assert.strictEqual(evaluate("number('5.')", doc), 5);
    assert.strictEqual(evaluate("number('.5')", doc), 0.5);
    assert.strictEqual(evaluate("number('-.5')", doc), -0.5);
    assert.strictEqual(evaluate("number('007')", doc), 7);
  });

  it("applies the grammar to every string to number conversion", () => {
    assert.ok(Number.isNaN(evaluate("'1e3' + 0", doc)));
    assert.strictEqual(evaluate("'2' * 3", doc), 6);
  });
});

describe("XPath conformance: string() of numbers (4.2)", () => {
  const evaluator = new XPathEvaluator();

  it("never uses exponent notation", () => {
    assert.strictEqual(evaluator.toString(1e21), "1000000000000000000000");
    assert.strictEqual(
      evaluator.toString(1.2345e25),
      "12345000000000000000000000",
    );
    assert.strictEqual(evaluator.toString(0.0000001), "0.0000001");
    assert.strictEqual(evaluator.toString(-1.5e-7), "-0.00000015");
    assert.strictEqual(evaluator.toString(1e-10), "0.0000000001");
  });

  it("keeps the ordinary forms", () => {
    assert.strictEqual(evaluator.toString(-0), "0");
    assert.strictEqual(evaluator.toString(12), "12");
    assert.strictEqual(evaluator.toString(-1.25), "-1.25");
    assert.strictEqual(evaluator.toString(NaN), "NaN");
    assert.strictEqual(evaluator.toString(Infinity), "Infinity");
    assert.strictEqual(evaluator.toString(-Infinity), "-Infinity");
  });

  it("converts number literals in expressions", () => {
    const doc = xmlDoc("<r/>");
    assert.strictEqual(
      str("concat(1000000000000000000000, ' ', 0.0000001)", doc),
      "1000000000000000000000 0.0000001",
    );
  });
});

describe("XPath conformance: prefixed function calls", () => {
  const doc = xmlDoc("<r><a/><a/></r>");
  const namespaces = { f: "urn:f", g: "urn:g" };

  /**
   * Evaluator with a function registered by expanded name.
   *
   * @returns {XPathEvaluator} The evaluator
   */
  function withBar() {
    return new XPathEvaluator().registerFunctions({
      "{urn:f}bar": function bar(args, ctx) {
        return this.toNumber(this.evaluate(args[0], ctx)) * 2;
      },
    });
  }

  it("parses QName function calls in every position", async () => {
    const { parse } = await import("./parser.js");
    for (const expr of [
      "f:bar(1)",
      "f:bar(1) + 1",
      "count(f:bar(1))",
      "f:bar(r)/a",
      "- f:bar(1)",
      "f:node()",
    ]) {
      assert.doesNotThrow(() => parse(expr), expr);
    }
    const ast = parse("f:bar(1, 2)");
    assert.strictEqual(ast.prefix, "f");
    assert.strictEqual(ast.name, "bar");
    assert.strictEqual(ast.args.length, 2);
  });

  it("resolves prefixed functions by expanded name", async () => {
    const { parse } = await import("./parser.js");
    const { XPathContext } = await import("./evaluator.js");
    const evaluator = withBar();
    const ctx = new XPathContext(doc, 1, 1, {}, namespaces);
    assert.strictEqual(evaluator.evaluate(parse("f:bar(21)"), ctx), 42);
    assert.throws(
      () => evaluator.evaluate(parse("g:bar(1)"), ctx),
      /Unknown function: g:bar/,
    );
    assert.throws(
      () => evaluator.evaluate(parse("h:bar(1)"), ctx),
      /Unknown function: h:bar/,
    );
  });

  it("still finds functions registered under a prefixed name", async () => {
    const { parse } = await import("./parser.js");
    const { XPathContext } = await import("./evaluator.js");
    const evaluator = new XPathEvaluator().registerFunctions({
      "my:one": () => 1,
    });
    assert.strictEqual(
      evaluator.evaluate(parse("my:one()"), new XPathContext(doc)),
      1,
    );
  });

  it("reports whether an expanded function name is registered", () => {
    const evaluator = withBar();
    assert.strictEqual(evaluator.hasFunction("bar", "urn:f"), true);
    assert.strictEqual(evaluator.hasFunction("bar", "urn:g"), false);
    assert.strictEqual(evaluator.hasFunction("concat"), true);
    assert.strictEqual(evaluator.hasFunction("constructor"), false);
  });
});

describe("XPath conformance: the xml prefix is predeclared", () => {
  const doc = xmlDoc(
    `<r xml:lang="en"><x:e xmlns:x="urn:x" xml:space="preserve"/></r>`,
  );

  it("matches xml: attributes without a declaration", () => {
    assert.strictEqual(str("r/@xml:lang", doc), "en");
    assert.strictEqual(evaluate("count(//@xml:*)", doc), 2);
  });

  it("does not let the context redeclare the xml prefix", () => {
    assert.strictEqual(
      str("r/@xml:lang", doc, { namespaces: { xml: "urn:other" } }),
      "en",
    );
  });
});

describe("XPath conformance: attribute axis excludes namespace declarations", () => {
  const doc = xmlDoc(`<r xmlns:f="urn:f" xmlns="urn:d" a="1" f:b="2"/>`);

  it("skips xmlns attributes", () => {
    assert.strictEqual(evaluate("count(*/@*)", doc), 2);
    assert.strictEqual(evaluate("count(*/attribute::node())", doc), 2);
    assert.strictEqual(evaluate("count(*/@xmlns)", doc), 0);
  });
});

describe("XPath conformance: adjacent text and CDATA form one text node (5.7)", () => {
  const doc = xmlDoc(
    `<r><e>a<![CDATA[b]]>c</e><i/>x<![CDATA[y]]><j/><![CDATA[z]]></r>`,
  );

  it("returns one text node per run on the child axis", () => {
    assert.strictEqual(evaluate("count(r/e/text())", doc), 1);
    assert.strictEqual(str("r/e/text()", doc), "abc");
    assert.strictEqual(evaluate("count(r/node())", doc), 5);
    assert.strictEqual(str("r/text()[1]", doc), "xy");
    assert.strictEqual(str("r/text()[2]", doc), "z");
  });

  it("returns one text node per run on the other axes", () => {
    assert.strictEqual(evaluate("count(//text())", doc), 3);
    assert.strictEqual(evaluate("count(/descendant-or-self::text())", doc), 3);
    assert.strictEqual(
      evaluate("count(r/i/following-sibling::node())", doc),
      3,
    );
    assert.strictEqual(
      evaluate("count(r/j/preceding-sibling::node())", doc),
      3,
    );
    assert.strictEqual(str("r/j/preceding-sibling::node()[1]", doc), "xy");
    assert.strictEqual(evaluate("count(r/e/following::text())", doc), 2);
    assert.strictEqual(evaluate("count(r/i/following::node())", doc), 3);
    assert.strictEqual(evaluate("count(r/j/preceding::text())", doc), 2);
    assert.strictEqual(str("r/j/preceding::text()[2]", doc), "abc");
    assert.strictEqual(
      evaluate("count(r/e/text()/following-sibling::node())", doc),
      0,
    );
  });

  it("merges adjacent plain text nodes too", () => {
    const d = xmlDoc("<r/>");
    d.documentElement.appendChild(d.createTextNode("p"));
    d.documentElement.appendChild(d.createTextNode("q"));
    assert.strictEqual(evaluate("count(r/text())", d), 1);
    assert.strictEqual(str("r/text()", d), "pq");
    assert.strictEqual(str("r", d), "pq");
  });

  it("keeps the string value of elements", () => {
    assert.strictEqual(str("r", doc), "abcxyz");
    assert.strictEqual(select("r/e/text()", doc)[0].nodeValue, "a");
  });
});

describe("XPath conformance: strings count code points", () => {
  const doc = xmlDoc("<r>\u{1F600}x\u{1F601}</r>");

  it("counts characters, not UTF-16 units", () => {
    assert.strictEqual(evaluate("string-length(r)", doc), 3);
    assert.strictEqual(evaluate("string-length('\u{1F600}')", doc), 1);
  });

  it("never splits surrogate pairs in substring()", () => {
    assert.strictEqual(evaluate("substring(r, 2)", doc), "x\u{1F601}");
    assert.strictEqual(evaluate("substring(r, 1, 1)", doc), "\u{1F600}");
    assert.strictEqual(evaluate("substring(r, 3, 1)", doc), "\u{1F601}");
    assert.strictEqual(evaluate("substring(r, 0, 2)", doc), "\u{1F600}");
  });

  it("maps characters in translate()", () => {
    assert.strictEqual(
      evaluate("translate(r, '\u{1F600}\u{1F601}', 'A')", doc),
      "Ax",
    );
    assert.strictEqual(
      evaluate("translate(r, 'x', '\u{1F602}')", doc),
      "\u{1F600}\u{1F602}\u{1F601}",
    );
  });
});

describe("XPath conformance: number literals", () => {
  it("accepts a trailing decimal point", () => {
    const tokens = tokenize("5. + 1");
    assert.strictEqual(tokens[0].type, TokenType.NUMBER);
    assert.strictEqual(tokens[0].value, 5);
    assert.strictEqual(evaluate("5. + 1", xmlDoc("<r/>")), 6);
    assert.strictEqual(evaluate("5.25", xmlDoc("<r/>")), 5.25);
  });
});
