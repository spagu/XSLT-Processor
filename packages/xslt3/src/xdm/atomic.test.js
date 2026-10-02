import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  atomic,
  AtomicValue,
  checkFacets,
  isArray,
  isAtomic,
  isFunctionItem,
  isMap,
  isNode,
  ITEM_KIND,
  itemKind,
} from "./atomic.js";
import { Decimal } from "./decimal.js";
import { types } from "./types.js";

describe("atomic values", () => {
  it("builds frozen values with coerced representations", () => {
    const v = atomic("xs:integer", 42);
    assert.ok(v instanceof AtomicValue);
    assert.equal(v.type, types.integer);
    assert.equal(v.value, 42n);
    assert.ok(Object.isFrozen(v));
    assert.equal(atomic("xs:long", 5n).value, 5n);
    assert.equal(atomic("xs:decimal", 1.5).value.toString(), "1.5");
    assert.equal(atomic("xs:decimal", 7n).value.toString(), "7");
    assert.equal(atomic("xs:decimal", "0.10").value.toString(), "0.1");
    const d = Decimal.parse("2.5");
    assert.equal(atomic("xs:decimal", d).value, d);
    assert.equal(atomic("xs:float", 1.1).value, Math.fround(1.1));
    assert.equal(atomic("xs:double", 1.1).value, 1.1);
    assert.equal(atomic("xs:string", "x").value, "x");
  });

  it("rejects invalid values", () => {
    assert.throws(() => atomic("xs:integer", 1.5), { code: "FORG0001" });
    assert.throws(() => atomic("xs:decimal", "abc"), { code: "FORG0001" });
    assert.throws(() => atomic("xs:byte", 128), { code: "FORG0001" });
    assert.throws(() => atomic("xs:negativeInteger", 0), { code: "FORG0001" });
    assert.throws(() => atomic("xs:NCName", "a:b"), { code: "FORG0001" });
    assert.throws(() => atomic("xs:token", " a"), { code: "FORG0001" });
    assert.throws(() => atomic("xs:normalizedString", "a\tb"), {
      code: "FORG0001",
    });
    assert.throws(() => atomic("xs:NOTATION", "x"), { code: "XPST0080" });
    assert.throws(() => atomic("xs:anyAtomicType", "x"), { code: "XPST0080" });
    assert.throws(() => atomic("xs:error", "x"), { code: "FORG0001" });
  });

  it("checks facets up to the primitive", () => {
    assert.equal(checkFacets(types.unsignedByte, 255n), 255n);
    assert.throws(() => checkFacets(types.unsignedByte, 256n), {
      code: "FORG0001",
    });
    assert.throws(() => checkFacets(types.ID, "1x"), { code: "FORG0001" });
    assert.throws(() => checkFacets(types.dateTimeStamp, { timezone: null }), {
      code: "FORG0001",
    });
    assert.deepEqual(checkFacets(types.dateTimeStamp, { timezone: 0 }), {
      timezone: 0,
    });
  });

  it("classifies items", () => {
    const node = { nodeType: 1 };
    const map = { [ITEM_KIND]: "map" };
    const array = { [ITEM_KIND]: "array", members: [] };
    const fn = { [ITEM_KIND]: "function" };
    const value = atomic("xs:boolean", true);
    assert.equal(itemKind(value), "atomic");
    assert.equal(itemKind(node), "node");
    assert.equal(itemKind(map), "map");
    assert.equal(itemKind(array), "array");
    assert.equal(itemKind(fn), "function");
    assert.throws(() => itemKind(42), { code: "XPTY0004" });
    assert.throws(() => itemKind(null), { code: "XPTY0004" });
    assert.ok(isAtomic(value) && !isAtomic(node));
    assert.ok(isNode(node) && !isNode(value) && !isNode(undefined));
    assert.ok(isMap(map) && !isMap(array) && !isMap(null));
    assert.ok(isArray(array) && !isArray(map));
    assert.ok(
      isFunctionItem(fn) && isFunctionItem(map) && !isFunctionItem(node),
    );
  });
});
