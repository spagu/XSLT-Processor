import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertError, atomic, parse, qn, seqType } from "./helpers.test.js";
import { parseXPath } from "./index.js";

/** The SequenceType of `. instance of T`. */
const type = (text) => parse(`. instance of ${text}`).sequenceType;

describe("SequenceType", () => {
  it("parses empty-sequence()", () => {
    assert.deepEqual(type("empty-sequence()"), seqType(null));
    assertError(". instance of empty-sequence(1)", /Expected "\)"/);
  });

  it("parses the occurrence indicators", () => {
    assert.deepEqual(type("xs:string"), seqType(atomic("string")));
    assert.deepEqual(type("xs:string?"), seqType(atomic("string"), "?"));
    assert.deepEqual(type("xs:string*"), seqType(atomic("string"), "*"));
    assert.deepEqual(type("xs:string+"), seqType(atomic("string"), "+"));
  });

  it("records the offsets", () => {
    const { sequenceType } = parseXPath(". instance of item()* ");
    assert.deepEqual([sequenceType.start, sequenceType.end], [14, 21]);
  });
});

describe("ItemType", () => {
  it("parses item() and atomic types", () => {
    assert.deepEqual(type("item()").itemType, { type: "AnyItemTest" });
    assert.deepEqual(type("Q{u}t").itemType, {
      type: "AtomicType",
      name: qn("t", null, "u"),
    });
    assert.deepEqual(type("item").itemType, {
      type: "AtomicType",
      name: qn("item"),
    });
  });

  it("drops the parentheses of a ParenthesizedItemType", () => {
    assert.deepEqual(type("(xs:int)*"), seqType(atomic("int"), "*"));
    assert.deepEqual(type("((node()))").itemType, { type: "AnyKindTest" });
  });

  it("parses function tests", () => {
    assert.deepEqual(type("function(*)").itemType, { type: "AnyFunctionTest" });
    assert.deepEqual(type("function(xs:int) as item()*").itemType, {
      type: "TypedFunctionTest",
      paramTypes: [seqType(atomic("int"))],
      returnType: seqType({ type: "AnyItemTest" }, "*"),
    });
    assert.deepEqual(
      type("function() as empty-sequence()").itemType.paramTypes,
      [],
    );
    assert.equal(
      type("function(xs:int, item()?) as xs:int").itemType.paramTypes.length,
      2,
    );
    assertError(". instance of function(xs:int)", /Expected "as"/);
  });

  it("parses map tests", () => {
    assert.deepEqual(type("map(*)").itemType, { type: "AnyMapTest" });
    assert.deepEqual(type("map(xs:string, item()+)").itemType, {
      type: "TypedMapTest",
      keyType: atomic("string"),
      valueType: seqType({ type: "AnyItemTest" }, "+"),
    });
    assertError(". instance of map(xs:string)", /Expected ","/);
    assertError(". instance of map(item(), item())", /found "\("/);
  });

  it("parses array tests", () => {
    assert.deepEqual(type("array(*)").itemType, { type: "AnyArrayTest" });
    assert.deepEqual(type("array(xs:int?)").itemType, {
      type: "TypedArrayTest",
      memberType: seqType(atomic("int"), "?"),
    });
  });

  it("records the offsets of tests with keywords", () => {
    const { itemType } = parseXPath(
      ". instance of function() as xs:int",
    ).sequenceType;
    assert.deepEqual([itemType.start, itemType.end], [14, 34]);
  });

  it("rejects what is not an item type", () => {
    assertError(". instance of 1", /Expected an item type/);
    assertError(". instance of (xs:int", /Expected "\)"/);
    assertError(". instance of xs:int()", /found "\("/);
  });
});
