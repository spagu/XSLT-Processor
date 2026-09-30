/**
 * Tests for the installation of the engine method groups.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { installMethods } from "./methods.js";
import { XsltEngine } from "../engine.js";

describe("installMethods", () => {
  it("installs methods and getters as non-enumerable properties", () => {
    class Host {}
    installMethods(
      Host.prototype,
      {
        twice(value) {
          return value * 2;
        },
      },
      {
        get answer() {
          return this.twice(21);
        },
      },
    );
    const host = new Host();
    assert.strictEqual(host.answer, 42);
    assert.deepStrictEqual(Object.keys(Host.prototype), []);
  });

  it("rejects a method defined by two groups", () => {
    class Host {}
    const group = { run() {} };
    assert.throws(
      () => installMethods(Host.prototype, group, group),
      /Engine method defined twice: run/,
    );
  });

  it("keeps the engine methods on the XsltEngine prototype", () => {
    for (const name of [
      "importStylesheet",
      "transform",
      "transformToFragment",
      "transformToDocument",
      "transformToString",
      "processChildren",
      "xslApplyTemplates",
      "xslNumber",
      "sortHost",
    ]) {
      assert.ok(name in XsltEngine.prototype, name);
    }
    assert.deepStrictEqual(Object.keys(XsltEngine.prototype), []);
  });
});
