import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { focusItem, focusNode } from "./focus.js";
import { createFunctionLibrary, FunctionLibrary } from "./registry.js";
import { isStandardFunction, NS } from "./signatures.js";

const define = (local, params, extra = {}) => ({
  local,
  params,
  returns: "item()*",
  impl: () => [],
  ...extra,
});

describe("function libraries", () => {
  it("looks definitions up by name and arity", () => {
    const one = define("f", ["item()"]);
    const two = define("f", ["item()", "item()"]);
    const library = createFunctionLibrary([one], [two]);
    assert.equal(library.lookup(NS.fn, "f", 1), one);
    assert.equal(library.lookup(NS.fn, "f", 2), two);
    assert.equal(library.lookup(NS.fn, "f", 3), null);
    assert.equal(library.lookup(NS.fn, "g", 1), null);
    assert.equal(FunctionLibrary.key("urn:a", "b"), "{urn:a}b");
  });

  it("matches variadic definitions from their minimum arity", () => {
    const variadic = define("v", ["item()", "item()"], { variadic: true });
    const library = createFunctionLibrary([variadic]);
    assert.equal(library.lookup(NS.fn, "v", 1), null);
    assert.equal(library.lookup(NS.fn, "v", 2), variadic);
    assert.equal(library.lookup(NS.fn, "v", 9), variadic);
  });

  it("lets later definitions and extensions win", () => {
    const first = define("f", []);
    const second = define("f", []);
    const library = createFunctionLibrary([first, second]);
    assert.equal(library.lookup(NS.fn, "f", 0), second);
    const other = define("g", [], { namespace: "urn:x" });
    const extended = library.extend([other]);
    assert.equal(extended.lookup("urn:x", "g", 0), other);
    assert.equal(library.lookup("urn:x", "g", 0), null);
  });
});

describe("the catalog of standard functions", () => {
  it("knows names and arities of F&O 3.1", () => {
    assert.ok(isStandardFunction(NS.fn, "substring", 2));
    assert.ok(isStandardFunction(NS.fn, "substring", 3));
    assert.ok(!isStandardFunction(NS.fn, "substring", 1));
    assert.ok(isStandardFunction(NS.fn, "concat", 99));
    assert.ok(isStandardFunction(NS.fn, "format-date", 5));
    assert.ok(!isStandardFunction(NS.fn, "format-date", 3));
    assert.ok(isStandardFunction(NS.math, "atan2", 2));
    assert.ok(isStandardFunction(NS.map, "merge", 1));
    assert.ok(isStandardFunction(NS.array, "subarray", 3));
    assert.ok(!isStandardFunction("urn:x", "f", 0));
  });
});

describe("helpers of implementations", () => {
  it("reads the focus", () => {
    assert.equal(focusItem({ contextItem: 1 }), 1);
    assert.throws(() => focusItem({}), { code: "XPDY0002" });
    const node = { nodeType: 1 };
    assert.equal(focusNode({ contextItem: node }), node);
    assert.throws(() => focusNode({ contextItem: "a" }), { code: "XPTY0004" });
  });
});
