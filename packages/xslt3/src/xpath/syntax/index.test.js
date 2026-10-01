import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { XPathError } from "../../errors.js";
import { makeNode } from "./ast.js";
import { parse } from "./helpers.test.js";
import { parseXPath } from "./index.js";
import { syntaxError } from "./syntaxError.js";
import { TokenStream, isPlainName, qName } from "./tokenStream.js";

describe("parseXPath", () => {
  it("returns the root expression with offsets", () => {
    assert.deepEqual(parseXPath(" 1 "), {
      type: "NumericLiteral",
      kind: "integer",
      value: "1",
      start: 1,
      end: 2,
    });
  });

  it("accepts xpathVersion 3.1 and rejects others", () => {
    assert.equal(
      parseXPath("1", { xpathVersion: "3.1" }).type,
      "NumericLiteral",
    );
    assert.throws(() => parseXPath("1", { xpathVersion: "4.0" }), RangeError);
  });

  it("rejects trailing tokens", () => {
    assert.throws(
      () => parseXPath("1 2"),
      /XPST0003: Unexpected token, found "2" at offset 2/,
    );
  });

  it("converts the expression to a string", () => {
    assert.equal(parseXPath(5).value, "5");
  });

  it("parses a realistic expression", () => {
    const ast = parse(
      "for $i in //item[@price > 10] return map { 'name': string($i/@name), 'tags': array { $i/tag ! string() } }",
    );
    assert.equal(ast.type, "ForExpr");
    assert.equal(ast.returnExpr.entries[1].value.expr.type, "SimpleMapExpr");
  });
});

describe("syntaxError", () => {
  it("shows the offset and an excerpt with a caret", () => {
    const error = syntaxError("1 + )", 4, "Bad");
    assert.ok(error instanceof XPathError);
    assert.equal(error.code, "XPST0003");
    assert.equal(error.message, 'XPST0003: Bad at offset 4: "1 + ^)"');
  });

  it("shortens long expressions around the offset", () => {
    const source = `${"a".repeat(30)}!${"b".repeat(30)}`;
    const { message } = syntaxError(source, 30, "Bad", "XPTY0004");
    assert.match(
      message,
      /^XPTY0004: Bad at offset 30: "\.\.\.a{20}\^!b{19}\.\.\."$/,
    );
  });
});

describe("TokenStream", () => {
  it("peeks, consumes and stays on eof", () => {
    const p = new TokenStream("a");
    assert.equal(p.peek(5).type, "eof");
    assert.equal(p.next().local, "a");
    assert.equal(p.lastEnd, 1);
    assert.equal(p.next().type, "eof");
    assert.equal(p.next().type, "eof");
  });

  it("recognises keywords only as plain names", () => {
    const p = new TokenStream("div p:div Q{}div");
    assert.equal(p.isKeyword("div"), true);
    assert.equal(p.isKeyword("div", 1), false);
    assert.equal(p.isKeyword("div", 2), false);
    assert.equal(isPlainName(p.peek(1)), false);
    assert.deepEqual(qName(p.peek(2)), { prefix: null, local: "div", uri: "" });
  });

  it("fails with the expected and found tokens", () => {
    const p = new TokenStream("a");
    assert.throws(() => p.expectSymbol("("), /Expected "\(", found "a"/);
    assert.throws(() => p.expectKeyword("then"), /Expected "then", found "a"/);
    p.next();
    assert.throws(
      () => p.expectName(),
      /Expected a name, found end of expression/,
    );
  });
});

describe("makeNode", () => {
  it("orders the fields type, fields, start, end", () => {
    const node = makeNode("X", { a: 1 }, 2, 3);
    assert.deepEqual(Object.keys(node), ["type", "a", "start", "end"]);
  });
});
