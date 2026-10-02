import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DocumentOrder } from "./eval/documentOrder.js";
import {
  COMPILED_CACHE_SIZE,
  compileXPath,
  createFunctionLibrary,
  defaultFunctionLibrary,
  evaluateXPath,
  FunctionLibrary,
  XPathError,
} from "./index.js";
import { code, parse, xp, xs } from "./testing.test.js";
import { stringItem } from "./eval/atomics.js";

describe("compileXPath and evaluateXPath", () => {
  it("compiles once and evaluates with different variables and contexts", () => {
    const expr = compileXPath("count(//a) + $n", { variables: ["n"] });
    const one = parse("<r><a/></r>");
    const two = parse("<r><a/><a/></r>");
    assert.equal(expr.evaluate(one, { variables: { n: 1n } })[0].value, 2n);
    assert.equal(expr.evaluate(two, { variables: { n: 1 } })[0].value, 3);
  });

  it("evaluates without a context item", () => {
    assert.deepEqual(xp("1 to 3"), ["1", "2", "3"]);
    assert.equal(code("."), "XPDY0002");
    assert.equal(code("/"), "XPDY0002");
  });

  it("takes variables as an object of values", () => {
    assert.equal(
      xs("$a || $b", null, { variables: { a: "x", b: true } }),
      "xtrue",
    );
    assert.equal(code("$a", null, { variables: {} }), "XPST0008");
  });

  it("raises XPDY0002 for a declared variable without a value", () => {
    const expr = compileXPath("$v", { variables: { v: 1 } });
    assert.throws(() => expr.evaluate(null), { code: "XPDY0002" });
    assert.throws(() => expr.evaluate(null, {}), { code: "XPDY0002" });
  });

  it("accepts prefixed and EQName variable names", () => {
    const options = {
      namespaces: { p: "urn:p" },
      variables: { "p:x": 1, "Q{urn:q}y": 2 },
    };
    assert.equal(xs("$p:x + $Q{urn:q}y", null, options), "3");
  });

  it("rejects a context item that is a sequence of several items", () => {
    assert.throws(() => evaluateXPath(".", [1, 2]), XPathError);
    assert.equal(xs(".", [5]), "5");
  });

  it("raises the static errors at compile time", () => {
    assert.throws(() => compileXPath("1 +"), { code: "XPST0003" });
    assert.throws(() => compileXPath("$x"), { code: "XPST0008" });
    assert.throws(() => compileXPath("p:f()"), { code: "XPST0081" });
    assert.throws(() => compileXPath("nope()"), { code: "XPST0017" });
  });

  it("turns JavaScript limits into XPDY0130", () => {
    const deep = `${"(".repeat(20000)}1${")".repeat(20000)}`;
    assert.throws(() => compileXPath(deep), { code: "XPDY0130" });
    const recursive =
      "let $f := function($f, $n) { $f($f, $n + 1) } return $f($f, 0)";
    assert.throws(() => evaluateXPath(recursive), { code: "XPDY0130" });
  });

  it("adds function modules and accepts a complete library", () => {
    const shout = {
      namespace: "urn:x",
      local: "shout",
      params: ["xs:string"],
      returns: "xs:string",
      impl: ([[s]]) => [stringItem(`${s.value}!`)],
    };
    const options = { namespaces: { x: "urn:x" }, functions: [[shout]] };
    assert.equal(xs("x:shout('hi')", null, options), "hi!");
    const flat = { namespaces: { x: "urn:x" }, functions: [shout] };
    assert.equal(xs("x:shout('a')", null, flat), "a!");
    const library = createFunctionLibrary([shout]);
    assert.ok(library instanceof FunctionLibrary);
    const only = { namespaces: { x: "urn:x" }, functions: library };
    assert.equal(xs("x:shout('b')", null, only), "b!");
    assert.throws(() => compileXPath("true()", only).evaluate(), {
      code: "XPST0017",
    });
    assert.throws(() => compileXPath("x:other()", only), { code: "XPST0017" });
    assert.ok(
      defaultFunctionLibrary.lookup(
        "http://www.w3.org/2005/xpath-functions",
        "count",
        1,
      ),
    );
  });

  it("sees the changes made to a document between two evaluations", () => {
    const doc = parse("<r><a i='1'/><b/><a i='2'/></r>");
    const expr = compileXPath("(//b | //a)/name()");
    const names = () =>
      expr
        .evaluate(doc)
        .map((v) => v.value)
        .join(" ");
    assert.equal(names(), "a b a");
    const [first] = [...doc.getElementsByTagName("a")];
    doc.documentElement.appendChild(first);
    assert.equal(names(), "b a a");
    doc.documentElement.insertBefore(doc.createElement("a"), null);
    assert.equal(names(), "b a a a");
    const count = compileXPath("count(//a[@i])");
    assert.equal(String(count.evaluate(doc)[0].value), "2");
    first.removeAttribute("i");
    assert.equal(String(count.evaluate(doc)[0].value), "1");
  });

  it("remembers the descendants and attributes of a tree during an evaluation", () => {
    const doc = parse(
      "<r><i c='x' p='1'/><i c='y' p='2'/><i c='x' p='3'/><i p='4'/></r>",
    );
    assert.equal(
      xs("for $c in distinct-values(//i/@c) return sum(//i[@c = $c]/@p)", doc),
      "4 2",
    );
    assert.equal(xs("count(//i) + count(//i[@c][@c])", doc), "7");
  });

  it("keeps the compiled expressions of evaluateXPath in a small cache", () => {
    const doc = parse("<r><a/></r>");
    for (let i = 0; i <= COMPILED_CACHE_SIZE; i++) {
      assert.equal(
        evaluateXPath(`${i} + count(//a)`, doc)[0].value,
        BigInt(i + 1),
      );
    }
    assert.equal(evaluateXPath("0 + count(//a)", doc)[0].value, 1n);
    assert.equal(evaluateXPath("0 + count(//a)", doc)[0].value, 1n);
    const variables = { n: 2 };
    assert.equal(evaluateXPath("$n", null, { variables })[0].value, 2);
    assert.equal(
      evaluateXPath("$n", null, { variables: { n: 3 } })[0].value,
      3,
    );
    // Other static options are compiled every time
    const namespaces = { p: "urn:p" };
    assert.equal(xs("count(//p:a)", doc, { namespaces }), "0");
    assert.equal(code("count(//p:a)", doc), "XPST0081");
  });

  it("shares a document order cache between evaluations", () => {
    const doc = parse("<r><a/><b/></r>");
    const documentOrder = new DocumentOrder();
    const expr = compileXPath("//b | //a");
    assert.equal(expr.evaluate(doc, { documentOrder }).length, 2);
    assert.equal(expr.evaluate(doc, { documentOrder })[0].nodeName, "a");
  });
});
