/**
 * The polyfill entry: importing it installs XSLTProcessor where there is
 * none, and leaves a working native one alone.
 *
 * Run: node --test src/polyfill.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { XSLTProcessor } from "./XSLTProcessor.js";

describe("@tradik/xslt-processor/polyfill", () => {
  it("installs XSLTProcessor when the environment has none", async () => {
    delete globalThis.XSLTProcessor;
    await import("./polyfill.js");
    assert.strictEqual(globalThis.XSLTProcessor, XSLTProcessor);
  });
});
