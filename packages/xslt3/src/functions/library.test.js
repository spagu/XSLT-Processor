import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coreStringFunctions, libraryFunctions } from "./library.js";
import { checkDefinitions } from "./testing.test.js";

describe("function library", () => {
  checkDefinitions(libraryFunctions);

  it("has one definition per name and arity", () => {
    const keys = libraryFunctions.map(
      (d) => `${d.namespace}|${d.local}#${d.params.length}`,
    );
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(keys.length, 134);
  });

  it("leaves the core overlap out", () => {
    const names = new Set(libraryFunctions.map((d) => d.local));
    for (const def of coreStringFunctions) assert.ok(!names.has(def.local));
    for (const core of ["count", "empty", "exists", "string", "number"]) {
      assert.ok(!names.has(core));
    }
  });
});
