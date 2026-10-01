import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseQName, QNameValue } from "./qname.js";

const resolver = (prefix) => ({ "": "urn:default", p: "urn:p" })[prefix];

describe("QName values", () => {
  it("resolves prefixes", () => {
    const q = parseQName("p:local", resolver);
    assert.equal(q.namespaceURI, "urn:p");
    assert.equal(q.localName, "local");
    assert.equal(q.prefix, "p");
    assert.equal(String(q), "p:local");
    assert.ok(Object.isFrozen(q));
  });

  it("uses the resolver's default namespace for unprefixed names", () => {
    assert.equal(parseQName("local", resolver).namespaceURI, "urn:default");
    assert.equal(parseQName("local").namespaceURI, "");
    assert.equal(parseQName("local", () => null).namespaceURI, "");
    assert.equal(String(parseQName("local")), "local");
  });

  it("raises FONS0004 for unbound prefixes", () => {
    assert.throws(() => parseQName("q:local", resolver), { code: "FONS0004" });
    assert.throws(() => parseQName("p:local"), { code: "FONS0004" });
  });

  it("rejects invalid lexical forms", () => {
    for (const bad of ["", "a:b:c", ":a", "a:", "1a", "a b"]) {
      assert.equal(parseQName(bad, resolver), null, bad);
    }
  });

  it("defaults the prefix", () => {
    assert.equal(new QNameValue("urn:x", "a").prefix, "");
  });
});
