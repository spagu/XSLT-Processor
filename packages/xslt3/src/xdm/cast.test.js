import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atomic, AtomicValue } from "./atomic.js";
import { cast, castable } from "./cast.js";
import { canonicalString, fromLexical } from "./lexical.js";
import { types } from "./types.js";

const L = (type, text) => fromLexical(type, text);
const castTo = (item, type) => canonicalString(cast(item, type));

/** One sample per F&O 3.1 19.1 primitive, in the order of the table. */
const samples = {
  untypedAtomic: L("xs:untypedAtomic", "x"),
  string: L("xs:string", "x"),
  float: L("xs:float", "1.5"),
  double: L("xs:double", "1.5"),
  decimal: L("xs:decimal", "1.5"),
  integer: L("xs:integer", "2"),
  duration: L("xs:duration", "P1Y2DT3H"),
  yearMonthDuration: L("xs:yearMonthDuration", "P1Y"),
  dayTimeDuration: L("xs:dayTimeDuration", "PT1H"),
  dateTime: L("xs:dateTime", "2002-04-02T12:00:00Z"),
  time: L("xs:time", "12:00:00"),
  date: L("xs:date", "2002-04-02"),
  gYearMonth: L("xs:gYearMonth", "2002-04"),
  gYear: L("xs:gYear", "2002"),
  gMonthDay: L("xs:gMonthDay", "--04-02"),
  gDay: L("xs:gDay", "---02"),
  gMonth: L("xs:gMonth", "--04"),
  boolean: L("xs:boolean", "true"),
  base64Binary: L("xs:base64Binary", "AAEC"),
  hexBinary: L("xs:hexBinary", "0001"),
  anyURI: L("xs:anyURI", "http://x"),
  QName: L("xs:QName", "q"),
};

/** The F&O 3.1 19.1 table without the xs:NOTATION row and column. */
const table = {
  untypedAtomic: "YYMMMMMMMMMMMMMMMMMMMM",
  string: "YYMMMMMMMMMMMMMMMMMMMM",
  float: "YYYYMMNNNNNNNNNNNYNNNN",
  double: "YYYYMMNNNNNNNNNNNYNNNN",
  decimal: "YYYYYYNNNNNNNNNNNYNNNN",
  integer: "YYYYYYNNNNNNNNNNNYNNNN",
  duration: "YYNNNNYYYNNNNNNNNNNNNN",
  yearMonthDuration: "YYNNNNYYYNNNNNNNNNNNNN",
  dayTimeDuration: "YYNNNNYYYNNNNNNNNNNNNN",
  dateTime: "YYNNNNNNNYYYYYYYYNNNNN",
  time: "YYNNNNNNNNYNNNNNNNNNNN",
  date: "YYNNNNNNNYNYYYYYYNNNNN",
  gYearMonth: "YYNNNNNNNNNNYNNNNNNNNN",
  gYear: "YYNNNNNNNNNNNYNNNNNNNN",
  gMonthDay: "YYNNNNNNNNNNNNYNNNNNNN",
  gDay: "YYNNNNNNNNNNNNNYNNNNNN",
  gMonth: "YYNNNNNNNNNNNNNNYNNNNN",
  boolean: "YYYYYYNNNNNNNNNNNYNNNN",
  base64Binary: "YYNNNNNNNNNNNNNNNNYYNN",
  hexBinary: "YYNNNNNNNNNNNNNNNNYYNN",
  anyURI: "YYNNNNNNNNNNNNNNNNNNYN",
  QName: "YYNNNNNNNNNNNNNNNNNNNY",
};

describe("cast: the primitive table of F&O 3.1 19.1", () => {
  const targets = Object.keys(samples);
  for (const [source, row] of Object.entries(table)) {
    it(`casts from xs:${source}`, () => {
      targets.forEach((target, i) => {
        const label = `${source} -> ${target}`;
        if (row[i] === "N") {
          assert.throws(
            () => cast(samples[source], target),
            { code: "XPTY0004" },
            label,
          );
          assert.equal(castable(samples[source], target), false, label);
        } else if (row[i] === "Y") {
          assert.equal(
            cast(samples[source], target).type,
            types[target],
            label,
          );
        } else {
          try {
            cast(samples[source], target);
          } catch (error) {
            assert.notEqual(error.code, "XPTY0004", label);
          }
        }
      });
    });
  }
});

describe("cast: values", () => {
  it("casts to xs:string and xs:untypedAtomic with canonical forms", () => {
    assert.equal(castTo(L("xs:double", "1e0"), "xs:string"), "1");
    assert.equal(castTo(L("xs:double", "-0"), "xs:string"), "-0");
    assert.equal(cast(L("xs:integer", "5"), "xs:untypedAtomic").value, "5");
    assert.equal(castTo(L("xs:duration", "P0D"), "xs:string"), "PT0S");
  });

  it("casts between numeric types", () => {
    assert.equal(castTo(L("xs:double", "1e0"), "xs:decimal"), "1");
    assert.equal(castTo(L("xs:double", "3.124E1"), "xs:integer"), "31");
    assert.equal(castTo(L("xs:double", "-17.89"), "xs:integer"), "-17");
    assert.equal(castTo(L("xs:decimal", "3.1456"), "xs:integer"), "3");
    assert.equal(castTo(L("xs:float", "1.1"), "xs:decimal"), "1.1");
    assert.equal(
      cast(L("xs:float", "1.1"), "xs:double").value,
      Math.fround(1.1),
    );
    assert.equal(castTo(L("xs:double", "1e300"), "xs:float"), "INF");
    assert.equal(castTo(L("xs:decimal", "0.1"), "xs:float"), "0.1");
    assert.equal(
      castTo(L("xs:integer", "12345678901234567890"), "xs:double"),
      "1.2345678901234567E19",
    );
    assert.equal(castTo(L("xs:boolean", "true"), "xs:double"), "1");
    assert.equal(castTo(L("xs:boolean", "false"), "xs:float"), "0");
    assert.equal(castTo(L("xs:boolean", "true"), "xs:decimal"), "1");
    assert.equal(castTo(L("xs:boolean", "false"), "xs:decimal"), "0");
    assert.equal(castTo(L("xs:boolean", "true"), "xs:integer"), "1");
    assert.equal(castTo(L("xs:boolean", "false"), "xs:integer"), "0");
    assert.equal(castTo(L("xs:integer", "7"), "xs:decimal"), "7");
  });

  it("raises FOCA0002 for NaN and infinities to decimal and integer", () => {
    for (const text of ["NaN", "INF", "-INF"]) {
      assert.throws(() => cast(L("xs:double", text), "xs:decimal"), {
        code: "FOCA0002",
      });
      assert.throws(() => cast(L("xs:float", text), "xs:integer"), {
        code: "FOCA0002",
      });
    }
  });

  it("casts numbers to booleans", () => {
    const cases = [
      ["xs:double", "0", false],
      ["xs:double", "-0", false],
      ["xs:double", "NaN", false],
      ["xs:float", "2", true],
      ["xs:decimal", "0.0", false],
      ["xs:decimal", "0.1", true],
      ["xs:integer", "0", false],
      ["xs:integer", "-1", true],
    ];
    for (const [type, text, expected] of cases) {
      assert.equal(
        cast(L(type, text), "xs:boolean").value,
        expected,
        `${type} ${text}`,
      );
    }
  });

  it("casts between durations", () => {
    const d = L("xs:duration", "-P1Y2M3DT4H");
    assert.equal(castTo(d, "xs:yearMonthDuration"), "-P1Y2M");
    assert.equal(castTo(d, "xs:dayTimeDuration"), "-P3DT4H");
    assert.equal(
      castTo(L("xs:yearMonthDuration", "P1Y"), "xs:dayTimeDuration"),
      "PT0S",
    );
    assert.equal(
      castTo(L("xs:dayTimeDuration", "PT1H"), "xs:yearMonthDuration"),
      "P0M",
    );
    assert.equal(
      castTo(L("xs:yearMonthDuration", "P1Y"), "xs:duration"),
      "P1Y",
    );
  });

  it("casts between date and time types, keeping the timezone", () => {
    const dt = L("xs:dateTime", "2002-04-02T12:30:15.5-05:00");
    assert.equal(castTo(dt, "xs:date"), "2002-04-02-05:00");
    assert.equal(castTo(dt, "xs:time"), "12:30:15.5-05:00");
    assert.equal(castTo(dt, "xs:gYearMonth"), "2002-04-05:00");
    assert.equal(castTo(dt, "xs:gYear"), "2002-05:00");
    assert.equal(castTo(dt, "xs:gMonthDay"), "--04-02-05:00");
    assert.equal(castTo(dt, "xs:gDay"), "---02-05:00");
    assert.equal(castTo(dt, "xs:gMonth"), "--04-05:00");
    assert.equal(
      castTo(L("xs:date", "2002-04-02Z"), "xs:dateTime"),
      "2002-04-02T00:00:00Z",
    );
    assert.equal(castTo(L("xs:date", "-0044-03-15"), "xs:gYear"), "-0044");
  });

  it("casts between binary types and from QName", () => {
    assert.equal(
      castTo(L("xs:hexBinary", "0001FF"), "xs:base64Binary"),
      "AAH/",
    );
    assert.equal(
      castTo(L("xs:base64Binary", "AAH/"), "xs:hexBinary"),
      "0001FF",
    );
    assert.equal(castTo(L("xs:QName", "q"), "xs:string"), "q");
    assert.equal(castTo(L("xs:anyURI", "a b"), "xs:untypedAtomic"), "a b");
  });

  it("casts to derived types with facet checks", () => {
    assert.equal(castTo(L("xs:integer", "300"), "xs:short"), "300");
    assert.throws(() => cast(L("xs:integer", "300"), "xs:byte"), {
      code: "FORG0001",
    });
    assert.throws(() => cast(L("xs:byte", "-1"), "xs:unsignedShort"), {
      code: "FORG0001",
    });
    assert.equal(castTo(L("xs:decimal", "-1.9"), "xs:byte"), "-1");
    assert.throws(() => cast(L("xs:double", "1e3"), "xs:unsignedByte"), {
      code: "FORG0001",
    });
    assert.equal(castTo(L("xs:untypedAtomic", "  12 "), "xs:int"), "12");
    assert.throws(() => cast(L("xs:string", "1.0"), "xs:integer"), {
      code: "FORG0001",
    });
    assert.throws(() => cast(L("xs:integer", "5"), "xs:NCName"), {
      code: "FORG0001",
    });
    assert.equal(castTo(L("xs:anyURI", "a  b"), "xs:token"), "a b");
    assert.equal(castTo(L("xs:untypedAtomic", " a  b "), "xs:token"), "a b");
    assert.equal(castTo(L("xs:integer", "5"), "xs:token"), "5");
    assert.equal(castTo(L("xs:NCName", "abc"), "xs:ID"), "abc");
    const local = L("xs:dateTime", "2002-04-02T12:00:00");
    assert.throws(() => cast(local, "xs:dateTimeStamp"), { code: "FORG0001" });
    const stamped = cast(
      L("xs:dateTime", "2002-04-02T12:00:00Z"),
      "xs:dateTimeStamp",
    );
    assert.equal(stamped.type, types.dateTimeStamp);
  });

  it("casts up the hierarchy by relabelling", () => {
    const b = atomic("xs:byte", 5);
    assert.equal(cast(b, "xs:integer").type, types.integer);
    assert.equal(cast(b, "xs:integer").value, 5n);
    assert.equal(cast(b, "xs:decimal").value.toString(), "5");
    assert.equal(cast(L("xs:ID", "a"), "xs:string").value, "a");
    assert.equal(
      cast(L("xs:yearMonthDuration", "P1M"), "xs:duration").type,
      types.duration,
    );
    const stamp = L("xs:dateTimeStamp", "2002-04-02T12:00:00Z");
    assert.equal(cast(stamp, "xs:dateTime").type, types.dateTime);
    assert.equal(cast(b, "xs:byte"), b);
  });

  it("casts strings to QNames with a resolver", () => {
    const options = { resolveNamespace: (p) => (p === "p" ? "urn:p" : null) };
    assert.equal(
      cast(L("xs:string", "p:a"), "xs:QName", options).value.namespaceURI,
      "urn:p",
    );
    assert.throws(() => cast(L("xs:string", "x:a"), "xs:QName", options), {
      code: "FONS0004",
    });
    assert.equal(castable(L("xs:string", "x:a"), "xs:QName", options), false);
  });

  it("handles abstract types, unknown types and xs:error", () => {
    assert.throws(() => cast(samples.string, "xs:NOTATION"), {
      code: "XPST0080",
    });
    assert.throws(() => cast(samples.QName, "xs:NOTATION"), {
      code: "XPST0080",
    });
    assert.throws(() => cast(samples.string, "xs:anyAtomicType"), {
      code: "XPST0080",
    });
    assert.throws(() => castable(samples.string, "xs:NOTATION"), {
      code: "XPST0080",
    });
    assert.throws(() => castable(samples.string, "xs:nope"), {
      code: "XPST0051",
    });
    assert.throws(() => cast(samples.integer, "xs:error"), {
      code: "FORG0001",
    });
    assert.equal(castable(samples.string, "xs:error"), false);
    // a broken value is a bug, not a failed cast
    const broken = new AtomicValue(types.decimal, null);
    assert.throws(() => castable(broken, "xs:double"), TypeError);
  });

  it("answers castable", () => {
    assert.equal(castable(L("xs:string", "12"), "xs:byte"), true);
    assert.equal(castable(L("xs:string", "1200"), "xs:byte"), false);
    assert.equal(castable(L("xs:string", "2002-02-29"), "xs:date"), false);
  });
});
