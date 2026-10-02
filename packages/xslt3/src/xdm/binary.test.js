import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareBytes,
  formatBase64Binary,
  formatHexBinary,
  parseBase64Binary,
  parseHexBinary,
} from "./binary.js";

const bytes = (...values) => Uint8Array.from(values);

describe("binary types", () => {
  it("parses and formats hexBinary", () => {
    assert.deepEqual(parseHexBinary("0aFf"), bytes(10, 255));
    assert.deepEqual(parseHexBinary(""), bytes());
    assert.equal(formatHexBinary(bytes(10, 255, 0)), "0AFF00");
    assert.equal(parseHexBinary("abc"), null);
    assert.equal(parseHexBinary("zz"), null);
  });

  it("parses base64Binary per the XSD grammar", () => {
    assert.deepEqual(parseBase64Binary("AAEC"), bytes(0, 1, 2));
    assert.deepEqual(parseBase64Binary("AAE="), bytes(0, 1));
    assert.deepEqual(parseBase64Binary("AA=="), bytes(0));
    assert.deepEqual(parseBase64Binary("A A E C"), bytes(0, 1, 2));
    assert.deepEqual(parseBase64Binary("AA = ="), bytes(0));
    assert.deepEqual(parseBase64Binary(""), bytes());
    assert.deepEqual(parseBase64Binary("/+/+"), bytes(255, 239, 254));
    for (const bad of [
      "A",
      "AAA",
      "AB==",
      "AAF=",
      "A===",
      "AA=A",
      "AA*A",
      "====",
      "AA==AAAA",
    ]) {
      assert.equal(parseBase64Binary(bad), null, bad);
    }
  });

  it("formats base64Binary with padding", () => {
    assert.equal(formatBase64Binary(bytes()), "");
    assert.equal(formatBase64Binary(bytes(0)), "AA==");
    assert.equal(formatBase64Binary(bytes(0, 1)), "AAE=");
    assert.equal(formatBase64Binary(bytes(0, 1, 2)), "AAEC");
    assert.equal(formatBase64Binary(bytes(255, 239, 254, 1)), "/+/+AQ==");
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    assert.deepEqual(parseBase64Binary(formatBase64Binary(all)), all);
  });

  it("compares byte arrays", () => {
    assert.equal(compareBytes(bytes(1, 2), bytes(1, 2)), 0);
    assert.equal(compareBytes(bytes(1, 2), bytes(1, 3)), -1);
    assert.equal(compareBytes(bytes(2), bytes(1, 3)), 1);
    assert.equal(compareBytes(bytes(1), bytes(1, 0)), -1);
    assert.equal(compareBytes(bytes(1, 0), bytes(1)), 1);
  });
});
