import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as xdm from "./index.js";

describe("@tradik/xslt3/xdm public API", () => {
  it("exports the documented functions and classes", () => {
    const functions = [
      "allTypes",
      "arithmetic",
      "atomic",
      "atomize",
      "canonicalString",
      "cast",
      "castable",
      "checkFacets",
      "compareAtomic",
      "compareCodepoints",
      "deepEqualAtomic",
      "derivesFrom",
      "effectiveBooleanValue",
      "fromLexical",
      "generalCompare",
      "getType",
      "isArray",
      "isAtomic",
      "isFunctionItem",
      "isMap",
      "isNode",
      "isNumericType",
      "itemKind",
      "nodeStringValue",
      "normalizeWhitespace",
      "stringValue",
      "toNumber",
      "typedValue",
      "unaryArithmetic",
      "valueCompare",
      "AtomicValue",
      "DateTimeValue",
      "Decimal",
      "DurationValue",
      "QNameValue",
      "XPathError",
    ];
    for (const name of functions) {
      assert.equal(typeof xdm[name], "function", name);
    }
    assert.equal(xdm.DIVISION_SCALE, 18);
    assert.equal(typeof xdm.ITEM_KIND, "symbol");
    assert.equal(xdm.XS_NAMESPACE, "http://www.w3.org/2001/XMLSchema");
  });

  it("works end to end on the spec examples", () => {
    const { fromLexical: L, valueCompare, cast, canonicalString } = xdm;
    assert.equal(
      canonicalString(cast(L("xs:double", "1e0"), "xs:decimal")),
      "1",
    );
    assert.equal(
      valueCompare(L("xs:float", "1.1"), "eq", L("xs:double", "1.1")),
      false,
    );
    const error = new xdm.XPathError("FORG0001", "bad");
    assert.equal(error.message, "FORG0001: bad");
    assert.equal(error.code, "FORG0001");
    assert.equal(error.name, "XPathError");
  });
});
