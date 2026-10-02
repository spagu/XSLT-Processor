import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exportOf, loadModule, resolvePackage } from "./load.js";
import { createFixture, removeFixture } from "../../../test/fixtures.js";

describe("resolvePackage and loadModule", () => {
  it("finds installed packages and returns null for missing ones", async () => {
    const dir = await createFixture({});
    try {
      assert.match(resolvePackage("jsdom", dir), /^file:.*jsdom/);
      assert.equal(resolvePackage("no-such-package-xyz", dir), null);
      assert.equal(typeof (await loadModule("jsdom", dir)).JSDOM, "function");
      assert.equal(await loadModule("no-such-package-xyz", dir), null);
    } finally {
      await removeFixture(dir);
    }
  });

  it("reads named exports of ES and CommonJS modules", () => {
    assert.equal(exportOf({ a: 1 }, "a"), 1);
    assert.equal(exportOf({ default: { a: 2 } }, "a"), 2);
    assert.equal(exportOf({}, "a"), undefined);
  });
});
