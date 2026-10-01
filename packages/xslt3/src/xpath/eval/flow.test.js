import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { code, xp, xs } from "../testing.test.js";

describe("for, let, quantified, if and simple map expressions", () => {
  it("iterates with for, nesting several bindings", () => {
    assert.equal(
      xs("for $a in (1, 2), $b in ($a, 10) return $a * $b"),
      "1 10 4 20",
    );
    assert.deepEqual(xp("for $a in () return 1"), []);
  });

  it("binds whole sequences with let", () => {
    assert.equal(xs("let $s := (1, 2, 3) return count($s)"), "3");
  });

  it("evaluates some and every with early exit", () => {
    assert.equal(xs("some $x in (1, 2, 3) satisfies $x gt 2"), "true");
    assert.equal(xs("some $x in (1, 2) satisfies $x gt 2"), "false");
    assert.equal(xs("every $x in (1, 2) satisfies $x gt 0"), "true");
    assert.equal(
      xs("every $x in (1, 'a') satisfies $x instance of xs:integer"),
      "false",
    );
    assert.equal(xs("every $x in () satisfies false()"), "true");
    assert.equal(
      xs("some $x in (1, 2), $y in (3, 4) satisfies $x + $y = 6"),
      "true",
    );
    assert.equal(xs("some $x in (1, 0) satisfies 1 div $x = 1"), "true");
    assert.equal(
      xs("every $x in (0, 1) satisfies 1 div $x = 1", null, {
        backwardsCompatible: true,
      }),
      "false",
    );
  });

  it("chooses a branch by effective boolean value", () => {
    assert.equal(xs("if (()) then 'a' else 'b'"), "b");
    assert.equal(xs("if ('x') then 'a' else 'b'"), "a");
    assert.equal(code("if ((1, 2)) then 1 else 2"), "FORG0006");
  });

  it("maps each item with the simple map operator", () => {
    assert.equal(xs("(1, 2, 3) ! (. * 2)"), "2 4 6");
    assert.equal(xs("(5, 6) ! position()"), "1 2");
    assert.equal(xs("(5, 6) ! last()"), "2 2");
    assert.deepEqual(xp("() ! 1"), []);
  });
});
