import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allTypes,
  derivesFrom,
  getType,
  isNumericType,
  namePatterns,
  types,
  XS_NAMESPACE,
} from "./types.js";

describe("type registry", () => {
  it("looks types up by prefixed, local and Clark name", () => {
    const integer = getType("xs:integer");
    assert.equal(getType("integer"), integer);
    assert.equal(getType(`{${XS_NAMESPACE}}integer`), integer);
    assert.equal(getType(integer), integer);
    assert.equal(integer.name, "{http://www.w3.org/2001/XMLSchema}integer");
    assert.equal(integer.prefixedName, "xs:integer");
  });

  it("raises XPST0051 for unknown types", () => {
    assert.throws(() => getType("xs:nothing"), { code: "XPST0051" });
    assert.throws(() => getType("{urn:x}integer"), { code: "XPST0051" });
    assert.throws(() => getType(null), { code: "XPST0051" });
  });

  it("records the derivation hierarchy and primitives", () => {
    assert.equal(types.byte.base, types.short);
    assert.equal(types.byte.primitive, types.decimal);
    assert.equal(types.byte.castPrimitive, types.integer);
    assert.equal(types.ID.primitive, types.string);
    assert.equal(types.dayTimeDuration.castPrimitive, types.dayTimeDuration);
    assert.equal(types.dayTimeDuration.primitive, types.duration);
    assert.equal(types.dateTimeStamp.castPrimitive, types.dateTime);
    assert.equal(types.untypedAtomic.primitive, types.untypedAtomic);
    assert.equal(types.anyAtomicType.base, null);
    assert.equal(types.error.base, null);
    assert.equal(types.NOTATION.abstract, true);
    assert.equal(types.anyAtomicType.abstract, true);
  });

  it("has the whiteSpace facets of XSD", () => {
    assert.equal(types.string.whiteSpace, "preserve");
    assert.equal(types.untypedAtomic.whiteSpace, "preserve");
    assert.equal(types.normalizedString.whiteSpace, "replace");
    assert.equal(types.token.whiteSpace, "collapse");
    assert.equal(types.NCName.whiteSpace, "collapse");
    assert.equal(types.decimal.whiteSpace, "collapse");
  });

  it("checks derivation", () => {
    assert.ok(derivesFrom("xs:unsignedByte", "xs:integer"));
    assert.ok(derivesFrom("xs:integer", "xs:anyAtomicType"));
    assert.ok(derivesFrom(types.IDREF, types.Name));
    assert.ok(!derivesFrom("xs:integer", "xs:double"));
    assert.ok(!derivesFrom("xs:error", "xs:anyAtomicType"));
  });

  it("lists all types and recognizes numeric types", () => {
    assert.equal(allTypes().length, 47);
    assert.ok(isNumericType(types.positiveInteger));
    assert.ok(isNumericType(types.float));
    assert.ok(!isNumericType(types.string));
  });

  it("matches XML names", () => {
    assert.ok(namePatterns.ncName.test("a-b.c_dé́"));
    assert.ok(!namePatterns.ncName.test("a:b"));
    assert.ok(!namePatterns.ncName.test("1a"));
    assert.ok(namePatterns.name.test(":a:b"));
    assert.ok(namePatterns.nmToken.test("123"));
    assert.ok(namePatterns.ncName.test("\u{10000}x"));
  });
});
