import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateXPath } from "../index.js";
import { code, xp, xs } from "../testing.test.js";

describe("primary expressions", () => {
  it("evaluates numeric literals of the three types", () => {
    const [integer, decimal, double] = evaluateXPath("1, 1.50, 1.5e0");
    assert.equal(integer.type.localName, "integer");
    assert.equal(integer.value, 1n);
    assert.equal(decimal.type.localName, "decimal");
    assert.equal(decimal.value.toString(), "1.5");
    assert.equal(double.type.localName, "double");
    assert.equal(double.value, 1.5);
  });

  it("evaluates string literals, the empty sequence and the comma", () => {
    assert.deepEqual(xp("'it''s', (), (1, (2, 3))"), ["it's", "1", "2", "3"]);
    assert.deepEqual(xp("()"), []);
  });

  it("returns the context item", () => {
    assert.equal(xs(".", "abc"), "abc");
    assert.equal(code("."), "XPDY0002");
  });

  it("resolves variables to the innermost binding", () => {
    assert.equal(xs("let $x := 1 return let $x := 2 return $x"), "2");
    assert.equal(xs("let $x := 1, $y := 2 return $x + $y"), "3");
    assert.equal(
      xs("for $x in 1 to 2 return let $y := $x return ($x, $y)"),
      "1 1 2 2",
    );
    assert.equal(code("$undeclared"), "XPST0008");
    assert.equal(code("$p:x"), "XPST0081");
  });
});
