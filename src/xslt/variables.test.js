/**
 * Unit tests for the variable binding helpers (see variables.js).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  GlobalBindings,
  createVariableView,
  lookupVariable,
} from "./variables.js";

describe("GlobalBindings", () => {
  it("evaluates a definition once, on first use", () => {
    let calls = 0;
    const globals = new GlobalBindings((def) => {
      calls++;
      return def.value * 2;
    });
    globals.define("a", { value: 21 });

    assert.strictEqual(calls, 0);
    assert.strictEqual(globals.get("a"), 42);
    assert.strictEqual(globals.get("a"), 42);
    assert.strictEqual(calls, 1);
  });

  it("returns undefined for an unknown name", () => {
    const globals = new GlobalBindings(() => 1);
    assert.strictEqual(globals.has("x"), false);
    assert.strictEqual(globals.get("x"), undefined);
  });

  it("detects circular definitions", () => {
    const globals = new GlobalBindings((def) => globals.get(def.ref));
    globals.define("a", { ref: "b" });
    globals.define("b", { ref: "a" });
    assert.throws(
      () => globals.get("a"),
      /Circular definition of global variable \$a/,
    );
  });

  it("can retry a definition whose evaluation failed", () => {
    let fail = true;
    const globals = new GlobalBindings(() => {
      if (fail) throw new Error("boom");
      return "ok";
    });
    globals.define("a", {});
    assert.throws(() => globals.get("a"), /boom/);
    fail = false;
    assert.strictEqual(globals.get("a"), "ok");
  });
});

describe("variable lookup", () => {
  const globals = new GlobalBindings((def) => def.value);
  globals.define("g", { value: "global" });
  globals.define("v", { value: "shadowed" });
  const context = {
    variables: { v: "local" },
    parameters: { p: "param" },
    globals,
  };

  it("searches variables, parameters, then globals", () => {
    assert.deepStrictEqual(lookupVariable(context, "v"), {
      found: true,
      value: "local",
    });
    assert.strictEqual(lookupVariable(context, "p").value, "param");
    assert.strictEqual(lookupVariable(context, "g").value, "global");
    assert.strictEqual(lookupVariable(context, "none").found, false);
    assert.strictEqual(
      lookupVariable({ variables: {}, parameters: {} }, "g").found,
      false,
    );
  });

  it("exposes the bindings as a read-only object view", () => {
    const view = createVariableView(context);

    assert.strictEqual(Object.hasOwn(view, "g"), true);
    assert.strictEqual(Object.hasOwn(view, "none"), false);
    assert.strictEqual("p" in view, true);
    assert.strictEqual("none" in view, false);
    assert.strictEqual(view.v, "local");
    assert.strictEqual(view.none, undefined);
    assert.strictEqual(view[Symbol.iterator], undefined);
    assert.strictEqual(Symbol.iterator in view, false);
  });
});
