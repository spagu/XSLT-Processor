import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arithmetic } from "./arithmetic.js";
import { canonicalString, fromLexical } from "./lexical.js";

const L = (type, text) => fromLexical(type, text);
const ym = (text) => L("xs:yearMonthDuration", text);
const dt = (text) => L("xs:dayTimeDuration", text);
const show = (a, op, b, options) => {
  const item = arithmetic(a, op, b, options);
  return `${item.type.localName} ${canonicalString(item)}`;
};

describe("duration arithmetic (F&O 3.1 8.2)", () => {
  it("adds and subtracts durations of one kind", () => {
    assert.equal(
      show(ym("P2Y11M"), "+", ym("P3Y3M")),
      "yearMonthDuration P6Y2M",
    );
    assert.equal(
      show(ym("P2Y11M"), "-", ym("P3Y3M")),
      "yearMonthDuration -P4M",
    );
    assert.equal(
      show(dt("P2DT12H5M"), "+", dt("P5DT12H")),
      "dayTimeDuration P8DT5M",
    );
    assert.equal(
      show(dt("P2DT12H"), "-", dt("P1DT10H30M")),
      "dayTimeDuration P1DT1H30M",
    );
  });

  it("multiplies and divides by numbers", () => {
    assert.equal(
      show(ym("P2Y11M"), "*", L("xs:double", "2.3")),
      "yearMonthDuration P6Y9M",
    );
    assert.equal(
      show(L("xs:integer", "2"), "*", ym("P1M")),
      "yearMonthDuration P2M",
    );
    assert.equal(
      show(ym("P1M"), "*", L("xs:decimal", "0.5")),
      "yearMonthDuration P1M",
    );
    assert.equal(
      show(ym("-P1M"), "*", L("xs:decimal", "0.5")),
      "yearMonthDuration P0M",
    );
    assert.equal(
      show(dt("PT2H10M"), "*", L("xs:double", "2.1")),
      "dayTimeDuration PT4H33M",
    );
    assert.equal(
      show(ym("P2Y11M"), "div", L("xs:double", "1.5")),
      "yearMonthDuration P1Y11M",
    );
    assert.equal(
      show(dt("P1DT2H30M10.5S"), "div", L("xs:double", "1.5")),
      "dayTimeDuration PT17H40M7S",
    );
    assert.equal(
      show(dt("P1D"), "div", L("xs:double", "INF")),
      "dayTimeDuration PT0S",
    );
    assert.equal(
      show(ym("P1Y"), "div", L("xs:float", "-INF")),
      "yearMonthDuration P0M",
    );
  });

  it("raises FOCA0005 for NaN and FODT0002 for infinity or division by zero", () => {
    assert.throws(() => arithmetic(ym("P1Y"), "*", L("xs:double", "NaN")), {
      code: "FOCA0005",
    });
    assert.throws(() => arithmetic(dt("PT1S"), "div", L("xs:double", "NaN")), {
      code: "FOCA0005",
    });
    assert.throws(() => arithmetic(dt("PT1S"), "*", L("xs:double", "INF")), {
      code: "FODT0002",
    });
    assert.throws(() => arithmetic(ym("P1Y"), "div", L("xs:integer", "0")), {
      code: "FODT0002",
    });
    assert.throws(() => arithmetic(ym("P1Y"), "*", L("xs:double", "1e300")), {
      code: "FODT0002",
    });
  });

  it("divides durations by durations", () => {
    assert.equal(show(ym("P3Y4M"), "div", ym("-P1Y4M")), "decimal -2.5");
    assert.equal(
      show(dt("P2DT53M11S"), "div", dt("P1DT10H")),
      "decimal 1.437834967320261438",
    );
    assert.throws(() => arithmetic(dt("P1D"), "div", dt("PT0S")), {
      code: "FOAR0001",
    });
  });
});

describe("date and time arithmetic (F&O 3.1 10.8)", () => {
  it("adds yearMonthDurations, clamping the day", () => {
    assert.equal(
      show(L("xs:dateTime", "2000-10-30T11:12:00"), "+", ym("P1Y2M")),
      "dateTime 2001-12-30T11:12:00",
    );
    assert.equal(
      show(L("xs:date", "2000-01-31"), "+", ym("P1M")),
      "date 2000-02-29",
    );
    assert.equal(
      show(L("xs:date", "2000-03-31Z"), "-", ym("P1M")),
      "date 2000-02-29Z",
    );
    assert.equal(
      show(ym("-P12M"), "+", L("xs:date", "0001-01-01")),
      "date 0000-01-01",
    );
    assert.equal(
      show(L("xs:date", "2000-10-30"), "-", ym("P1Y2M")),
      "date 1999-08-30",
    );
  });

  it("adds dayTimeDurations", () => {
    assert.equal(
      show(L("xs:dateTime", "2000-10-30T11:12:00"), "+", dt("P3DT1H15M")),
      "dateTime 2000-11-02T12:27:00",
    );
    assert.equal(
      show(L("xs:dateTime", "2000-10-30T11:12:00"), "-", dt("P3DT1H15M")),
      "dateTime 2000-10-27T09:57:00",
    );
    assert.equal(
      show(L("xs:date", "2004-10-30Z"), "+", dt("P2DT2H30M0S")),
      "date 2004-11-01Z",
    );
    assert.equal(
      show(L("xs:date", "2000-10-30"), "-", dt("P3DT1H15M")),
      "date 2000-10-26",
    );
    assert.equal(
      show(dt("PT1H"), "+", L("xs:dateTimeStamp", "2000-01-01T23:30:00Z")),
      "dateTime 2000-01-02T00:30:00Z",
    );
  });

  it("wraps times around midnight", () => {
    assert.equal(
      show(L("xs:time", "11:12:00"), "+", dt("P3DT1H15M")),
      "time 12:27:00",
    );
    assert.equal(
      show(L("xs:time", "23:12:00+03:00"), "+", dt("P1DT3H15M")),
      "time 02:27:00+03:00",
    );
    assert.equal(
      show(L("xs:time", "11:12:00"), "-", dt("P3DT1H15M")),
      "time 09:57:00",
    );
    assert.equal(
      show(L("xs:time", "08:20:00-05:00"), "-", dt("P23DT10H10M")),
      "time 22:10:00-05:00",
    );
    assert.equal(
      show(L("xs:time", "00:00:00.5"), "-", dt("PT1S")),
      "time 23:59:59.5",
    );
  });

  it("subtracts dates and times, using the implicit timezone", () => {
    assert.equal(
      show(
        L("xs:dateTime", "2000-10-30T06:12:00"),
        "-",
        L("xs:dateTime", "1999-11-28T09:00:00Z"),
        { implicitTimezone: -300 },
      ),
      "dayTimeDuration P337DT2H12M",
    );
    assert.equal(
      show(L("xs:date", "2000-10-30"), "-", L("xs:date", "1999-11-28")),
      "dayTimeDuration P337D",
    );
    assert.equal(
      show(
        L("xs:date", "2000-10-15-05:00"),
        "-",
        L("xs:date", "2000-10-10+02:00"),
      ),
      "dayTimeDuration P5DT7H",
    );
    assert.equal(
      show(L("xs:time", "11:12:00Z"), "-", L("xs:time", "04:00:00-05:00")),
      "dayTimeDuration PT2H12M",
    );
    assert.equal(
      show(L("xs:time", "24:00:00"), "-", L("xs:time", "23:59:59")),
      "dayTimeDuration -PT23H59M59S",
    );
  });

  it("raises FODT0001 when the year overflows", () => {
    assert.throws(() => arithmetic(L("xs:gYear", "2000"), "+", ym("P1Y")), {
      code: "XPTY0004",
    });
    assert.throws(
      () => arithmetic(L("xs:date", "999999999-12-31"), "+", dt("P1D")),
      { code: "FODT0001" },
    );
    assert.throws(
      () => arithmetic(L("xs:date", "999999999-12-31"), "+", ym("P1M")),
      { code: "FODT0001" },
    );
  });

  it("raises XPTY0004 for unsupported combinations", () => {
    const cases = [
      [L("xs:time", "12:00:00"), "+", ym("P1M")],
      [
        L("xs:date", "2000-01-01"),
        "-",
        L("xs:dateTime", "2000-01-01T00:00:00"),
      ],
      [L("xs:duration", "P1D"), "+", L("xs:duration", "P1D")],
      [ym("P1Y"), "+", dt("P1D")],
      [L("xs:date", "2000-01-01"), "+", L("xs:date", "2000-01-01")],
      [L("xs:integer", "2"), "div", ym("P1M")],
      [ym("P1Y"), "-", L("xs:date", "2000-01-01")],
      [ym("P1Y"), "mod", ym("P1Y")],
      [L("xs:string", "x"), "+", ym("P1Y")],
    ];
    for (const [a, op, b] of cases) {
      assert.throws(
        () => arithmetic(a, op, b),
        { code: "XPTY0004" },
        `${a.type.localName} ${op} ${b.type.localName}`,
      );
    }
  });
});
