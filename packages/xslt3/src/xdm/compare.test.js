import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atomic, AtomicValue } from "./atomic.js";
import { compareAtomic, deepEqualAtomic, valueCompare } from "./compare.js";
import { fromLexical } from "./lexical.js";
import { types } from "./types.js";

const L = (type, text) => fromLexical(type, text);
const vc = (a, op, b, options) => valueCompare(a, op, b, options);

describe("valueCompare: numbers", () => {
  it("promotes integer → decimal → float → double", () => {
    assert.equal(vc(L("xs:integer", "1"), "eq", L("xs:decimal", "1.0")), true);
    assert.equal(vc(L("xs:integer", "1"), "lt", L("xs:double", "1.5")), true);
    assert.equal(vc(L("xs:float", "1.1"), "eq", L("xs:double", "1.1")), false);
    assert.equal(vc(L("xs:float", "1.1"), "eq", L("xs:decimal", "1.1")), true);
    assert.equal(
      vc(L("xs:decimal", "0.1"), "lt", L("xs:decimal", "0.2")),
      true,
    );
    assert.equal(vc(L("xs:byte", "5"), "eq", L("xs:unsignedLong", "5")), true);
    assert.equal(vc(L("xs:integer", "2"), "gt", L("xs:integer", "1")), true);
    assert.equal(vc(L("xs:integer", "1"), "ge", L("xs:integer", "1")), true);
    assert.equal(vc(L("xs:integer", "1"), "le", L("xs:integer", "0")), false);
    assert.equal(vc(L("xs:integer", "1"), "ne", L("xs:integer", "2")), true);
    assert.equal(
      vc(
        L("xs:integer", "9007199254740993"),
        "gt",
        L("xs:integer", "9007199254740992"),
      ),
      true,
    );
  });

  it("treats NaN as unequal and unordered and -0 as 0", () => {
    const nan = L("xs:double", "NaN");
    assert.equal(vc(nan, "eq", nan), false);
    assert.equal(vc(nan, "ne", nan), true);
    assert.equal(vc(nan, "lt", L("xs:double", "1")), false);
    assert.equal(vc(nan, "ge", L("xs:double", "1")), false);
    assert.equal(vc(L("xs:double", "-0"), "eq", L("xs:double", "0")), true);
    assert.equal(vc(L("xs:double", "-INF"), "lt", L("xs:float", "INF")), true);
  });
});

describe("valueCompare: other types", () => {
  it("compares strings, URIs and untyped values by codepoints", () => {
    assert.equal(vc(L("xs:string", "a"), "lt", L("xs:string", "b")), true);
    assert.equal(
      vc(L("xs:untypedAtomic", "1"), "eq", L("xs:string", "1")),
      true,
    );
    assert.equal(
      vc(L("xs:anyURI", "http://a"), "eq", L("xs:string", "http://a")),
      true,
    );
    assert.equal(
      vc(L("xs:string", "\u{10000}"), "gt", L("xs:string", "￿")),
      true,
    );
    const collation = (a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()) * 7;
    assert.equal(
      vc(L("xs:string", "A"), "eq", L("xs:string", "a"), { collation }),
      true,
    );
  });

  it("compares booleans", () => {
    const t = L("xs:boolean", "true");
    const f = L("xs:boolean", "false");
    assert.equal(vc(f, "lt", t), true);
    assert.equal(vc(t, "eq", t), true);
  });

  it("compares dates and times through the time line", () => {
    const dt = (text) => L("xs:dateTime", text);
    assert.equal(
      vc(
        dt("2002-04-02T12:00:00-01:00"),
        "eq",
        dt("2002-04-02T17:00:00+04:00"),
      ),
      true,
    );
    assert.equal(
      vc(dt("2002-04-02T12:00:00"), "eq", dt("2002-04-02T23:00:00+06:00"), {
        implicitTimezone: -300,
      }),
      true,
    );
    assert.equal(
      vc(dt("2002-04-02T12:00:00"), "lt", dt("2002-04-02T12:00:00Z"), {
        implicitTimezone: 60,
      }),
      true,
    );
    assert.equal(
      vc(L("xs:date", "2004-12-25Z"), "gt", L("xs:date", "2004-12-25+07:00")),
      true,
    );
    assert.equal(
      vc(L("xs:time", "08:00:00+09:00"), "eq", L("xs:time", "17:00:00-06:00")),
      false,
    );
    assert.equal(
      vc(L("xs:time", "21:30:00+10:30"), "eq", L("xs:time", "06:00:00-05:00")),
      true,
    );
    assert.equal(
      vc(
        dt("2002-04-02T12:00:00Z"),
        "eq",
        L("xs:dateTimeStamp", "2002-04-02T12:00:00Z"),
      ),
      true,
    );
  });

  it("allows only equality for the Gregorian types", () => {
    const a = L("xs:gDay", "---12-05:00");
    const b = L("xs:gDay", "---12Z");
    assert.equal(vc(a, "eq", b), false);
    assert.equal(
      vc(L("xs:gYear", "2005-12:00"), "eq", L("xs:gYear", "2005+12:00")),
      false,
    );
    assert.equal(
      vc(
        L("xs:gMonthDay", "--12-25-14:00"),
        "eq",
        L("xs:gMonthDay", "--12-26+10:00"),
      ),
      true,
    );
    assert.throws(() => vc(a, "lt", b), { code: "XPTY0004" });
  });

  it("compares durations", () => {
    const ym = (t) => L("xs:yearMonthDuration", t);
    const dtd = (t) => L("xs:dayTimeDuration", t);
    const d = (t) => L("xs:duration", t);
    assert.equal(vc(ym("P0Y"), "eq", dtd("PT0S")), true);
    assert.equal(vc(d("P1Y"), "eq", d("P12M")), true);
    assert.equal(vc(d("PT24H"), "eq", d("P1D")), true);
    assert.equal(vc(d("P1Y"), "eq", d("P365D")), false);
    assert.equal(vc(d("P1Y"), "ne", d("P365D")), true);
    assert.equal(vc(ym("P1Y"), "lt", ym("P13M")), true);
    assert.equal(vc(dtd("PT1H"), "gt", dtd("PT59M")), true);
    assert.throws(() => vc(d("P1Y"), "lt", d("P2Y")), { code: "XPTY0004" });
    assert.throws(() => vc(ym("P1Y"), "lt", dtd("PT1H")), { code: "XPTY0004" });
  });

  it("compares binary values", () => {
    assert.equal(
      vc(L("xs:hexBinary", "00"), "lt", L("xs:hexBinary", "01")),
      true,
    );
    assert.equal(
      vc(L("xs:base64Binary", "AA=="), "eq", L("xs:base64Binary", "AA==")),
      true,
    );
    assert.throws(
      () => vc(L("xs:hexBinary", "00"), "eq", L("xs:base64Binary", "AA==")),
      {
        code: "XPTY0004",
      },
    );
  });

  it("compares QNames by namespace and local name only", () => {
    const options = { resolveNamespace: () => "urn:x" };
    const a = fromLexical("xs:QName", "this:color", options);
    const b = fromLexical("xs:QName", "that:color", options);
    assert.equal(vc(a, "eq", b), true);
    assert.equal(vc(a, "ne", L("xs:QName", "color")), true);
    assert.throws(() => vc(a, "lt", b), { code: "XPTY0004" });
  });

  it("raises XPTY0004 for incomparable types", () => {
    assert.throws(() => vc(L("xs:string", "1"), "eq", L("xs:integer", "1")), {
      code: "XPTY0004",
    });
    assert.throws(
      () => vc(L("xs:untypedAtomic", "1"), "eq", L("xs:integer", "1")),
      { code: "XPTY0004" },
    );
    assert.throws(
      () =>
        vc(
          L("xs:date", "2000-01-01"),
          "eq",
          L("xs:dateTime", "2000-01-01T00:00:00"),
        ),
      {
        code: "XPTY0004",
      },
    );
  });

  it("reports order and orderability", () => {
    assert.deepEqual(
      compareAtomic(atomic("xs:integer", 1), atomic("xs:integer", 2)),
      {
        order: -1,
        ordered: true,
      },
    );
  });
});

describe("deepEqualAtomic", () => {
  it("treats NaN as equal to NaN and incomparable values as unequal", () => {
    const nan = L("xs:double", "NaN");
    assert.equal(deepEqualAtomic(nan, L("xs:float", "NaN")), true);
    assert.equal(deepEqualAtomic(nan, L("xs:double", "1")), false);
    assert.equal(deepEqualAtomic(L("xs:double", "1"), nan), false);
    assert.equal(
      deepEqualAtomic(L("xs:string", "1"), L("xs:integer", "1")),
      false,
    );
    assert.equal(
      deepEqualAtomic(L("xs:integer", "1"), L("xs:double", "1")),
      true,
    );
    assert.equal(
      deepEqualAtomic(L("xs:duration", "P1Y"), L("xs:duration", "P365D")),
      false,
    );
    const broken = new AtomicValue(types.decimal, null);
    assert.throws(() => deepEqualAtomic(broken, broken), TypeError);
    assert.equal(
      deepEqualAtomic(L("xs:gYear", "2000"), L("xs:gYear", "2000"), {
        implicitTimezone: 0,
      }),
      true,
    );
  });
});
