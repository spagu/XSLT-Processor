import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEAD_BYTES, extensionOf } from "../detectors.js";
import { emptyScan, headOf, inspectText } from "./inspect.js";

describe("headOf", () => {
  it("keeps short texts and cuts at HEAD_BYTES bytes", () => {
    assert.equal(headOf("<a/>"), "<a/>");
    assert.equal(headOf("x".repeat(HEAD_BYTES * 2)).length, HEAD_BYTES);
    // Two bytes per character: half as many characters fit
    assert.equal(headOf("é".repeat(HEAD_BYTES)).length, HEAD_BYTES / 2);
  });
});

describe("inspectText", () => {
  it("ignores files without a known extension", () => {
    const result = emptyScan();
    inspectText("Makefile", "XSLTProcessor", result);
    assert.deepEqual(result, emptyScan());
    assert.equal(extensionOf("dir.d/Makefile"), "");
    assert.equal(extensionOf(".gitignore"), "");
    assert.equal(extensionOf("A.HTML"), ".html");
  });
});
