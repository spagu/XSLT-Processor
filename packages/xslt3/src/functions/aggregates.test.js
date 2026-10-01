import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateFunctions } from "./aggregates.js";
import { call, checkDefinitions, throwsCode, v } from "./testing.test.js";

const f = (local, ...args) => call(aggregateFunctions, local, args);
/** Result as "type:value", or "()" for the empty sequence. */
const typed = (sequence) =>
  sequence.length === 0
    ? "()"
    : `${sequence[0].type.localName}:${String(sequence[0].value)}`;
const ym = (text) => v("yearMonthDuration", text);
const dt = (text) => v("dayTimeDuration", text);
const untyped = (text) => v("untypedAtomic", text);

describe("sum and avg", () => {
  checkDefinitions(aggregateFunctions);

  it("sum numbers and durations (F&O examples)", () => {
    assert.equal(typed(f("sum", [3n, 4n, 5n])), "integer:12");
    assert.equal(typed(f("sum", [])), "integer:0");
    assert.equal(typed(f("sum", [], null)), "()");
    assert.equal(f("sum", [], dt("PT0S"))[0].type.localName, "dayTimeDuration");
    assert.equal(typed(f("sum", [1n, v("decimal", "2.5")])), "decimal:3.5");
    assert.equal(typed(f("sum", [1n, untyped("2")])), "double:3");
    assert.equal(
      typed(f("sum", [v("float", "1"), v("decimal", "2")])),
      "float:3",
    );
    assert.equal(f("sum", [ym("P20Y"), ym("P10M")])[0].value.months, 250);
    assert.equal(
      f("sum", [dt("PT1H"), dt("PT30M")])[0].value.seconds.toString(),
      "5400",
    );
  });

  it("rejects mixed and non-additive values", () => {
    throwsCode(() => f("sum", [ym("P1Y"), dt("P1D")]), "FORG0006");
    throwsCode(() => f("sum", [v("duration", "P1Y")]), "FORG0006");
    throwsCode(() => f("sum", [1n, ym("P1Y")]), "FORG0006");
    throwsCode(() => f("sum", ["a"]), "FORG0006");
    throwsCode(() => f("avg", [untyped("x")]), "FORG0001");
  });

  it("averages numbers and durations (F&O examples)", () => {
    assert.equal(typed(f("avg", [3n, 4n, 5n])), "decimal:4");
    assert.equal(typed(f("avg", [])), "()");
    assert.equal(typed(f("avg", [Infinity, -Infinity])), "double:NaN");
    assert.equal(typed(f("avg", [3n, 4n, NaN])), "double:NaN");
    assert.equal(f("avg", [ym("P20Y"), ym("P10M")])[0].value.months, 125);
  });
});

describe("max and min", () => {
  it("find extremes of numbers (F&O examples)", () => {
    assert.equal(typed(f("max", [3n, 4n, 5n])), "integer:5");
    assert.equal(typed(f("max", [5n, 5.0])), "double:5");
    assert.equal(typed(f("max", [3n, 4.0, v("float", "5")])), "double:5");
    assert.equal(typed(f("max", [1n, v("float", "2")])), "float:2");
    assert.equal(typed(f("max", [1n, v("decimal", "0.5")])), "integer:1");
    assert.equal(typed(f("min", [3n, 4n, 5n])), "integer:3");
    assert.equal(typed(f("min", [untyped("2"), 3n])), "double:2");
    assert.equal(typed(f("max", [1n, NaN, 3n])), "double:NaN");
    assert.equal(typed(f("min", [])), "()");
  });

  it("find extremes of strings, dates and durations", () => {
    assert.equal(typed(f("max", ["a", "b", "c"])), "string:c");
    assert.equal(typed(f("max", ["a", v("anyURI", "b")])), "string:b");
    assert.equal(
      typed(f("max", [v("anyURI", "a"), v("anyURI", "b")])),
      "anyURI:b",
    );
    assert.equal(
      typed(
        f(
          "min",
          ["B", "a"],
          "http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive",
        ),
      ),
      "string:a",
    );
    assert.equal(typed(f("max", [true, false])), "boolean:true");
    assert.equal(
      f("max", [v("date", "2001-01-01"), v("date", "2002-01-01")])[0].value
        .year,
      2002,
    );
    assert.equal(f("min", [ym("P1Y"), ym("P1M")])[0].value.months, 1);
    assert.equal(
      typed(f("max", ["a"], "http://www.w3.org/2013/collation/UCA")),
      "string:a",
    );
  });

  it("rejects incomparable and unordered values", () => {
    throwsCode(() => f("max", [3n, "a"]), "FORG0006");
    throwsCode(() => f("max", [v("duration", "P1Y")]), "FORG0006");
    throwsCode(() => f("min", [ym("P1Y"), dt("P1D")]), "FORG0006");
    throwsCode(() => f("max", [v("QName", "a")]), "FORG0006");
    throwsCode(() => f("max", [v("gYear", "2001")]), "FORG0006");
    throwsCode(() => f("max", [1n], "http://example.com/c"), "FOCH0002");
  });
});
