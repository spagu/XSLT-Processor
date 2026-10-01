import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DocumentOrder } from "./eval/documentOrder.js";
import {
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

  it("shares a document order cache between evaluations", () => {
    const doc = parse("<r><a/><b/></r>");
    const documentOrder = new DocumentOrder();
    const expr = compileXPath("//b | //a");
    assert.equal(expr.evaluate(doc, { documentOrder }).length, 2);
    assert.equal(expr.evaluate(doc, { documentOrder })[0].nodeName, "a");
  });
});
