/**
 * URI helper tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { isAbsoluteUri, resolveUri, stripFragment } from "./uri.js";

describe("resolveUri", () => {
  it("should resolve a relative URI against a base directory", () => {
    assert.strictEqual(
      resolveUri("common.xsl", "/styles/main.xsl"),
      "/styles/common.xsl",
    );
  });

  it("should keep absolute URIs unchanged", () => {
    assert.strictEqual(
      resolveUri("https://example.com/a.xsl", "/styles/main.xsl"),
      "https://example.com/a.xsl",
    );
  });

  it("should keep root relative URIs unchanged", () => {
    assert.strictEqual(resolveUri("/a.xsl", "/styles/main.xsl"), "/a.xsl");
  });

  it("should keep the URI unchanged without a base", () => {
    assert.strictEqual(resolveUri("a.xsl"), "a.xsl");
  });

  it("should handle a base URI without any slash", () => {
    assert.strictEqual(resolveUri("a.xsl", "main.xsl"), "a.xsl");
  });

  it("should return falsy input unchanged", () => {
    assert.strictEqual(resolveUri("", "/styles/main.xsl"), "");
  });
});

describe("isAbsoluteUri", () => {
  it("should detect scheme qualified URIs", () => {
    assert.strictEqual(isAbsoluteUri("file:///tmp/a.xml"), true);
    assert.strictEqual(isAbsoluteUri("urn:example:a"), true);
  });

  it("should reject relative URIs", () => {
    assert.strictEqual(isAbsoluteUri("a/b.xml"), false);
  });
});

describe("stripFragment", () => {
  it("should remove a fragment identifier", () => {
    assert.strictEqual(stripFragment("data.xml#section"), "data.xml");
  });

  it("should keep a URI without a fragment", () => {
    assert.strictEqual(stripFragment("data.xml"), "data.xml");
  });

  it("should map non-string input to the empty string", () => {
    assert.strictEqual(stripFragment(undefined), "");
  });
});
