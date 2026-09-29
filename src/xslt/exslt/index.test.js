/**
 * EXSLT registration tests: every libexslt function is registered by
 * expanded name, reported by function-available(), and unknown EXSLT names
 * keep failing.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { XsltEngine } from "../engine.js";
import { valueOf } from "./exsltHarness.test.js";
import {
  EXSLT_COMMON,
  EXSLT_DATES,
  EXSLT_DYNAMIC,
  EXSLT_MATH,
  EXSLT_SETS,
  EXSLT_STRINGS,
  createExsltFunctions,
} from "./index.js";

/** Functions per prefix of the test harness, as libexslt registers them. */
const SUPPORTED = {
  exsl: ["node-set", "object-type"],
  math: [
    "min",
    "max",
    "highest",
    "lowest",
    "abs",
    "sqrt",
    "power",
    "constant",
    "log",
    "random",
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "atan2",
    "exp",
  ],
  set: [
    "difference",
    "intersection",
    "distinct",
    "has-same-node",
    "leading",
    "trailing",
  ],
  str: [
    "tokenize",
    "split",
    "replace",
    "padding",
    "align",
    "concat",
    "encode-uri",
    "decode-uri",
  ],
  date: [
    "date-time",
    "date",
    "time",
    "year",
    "leap-year",
    "month-in-year",
    "month-name",
    "month-abbreviation",
    "week-in-year",
    "week-in-month",
    "day-in-year",
    "day-in-month",
    "day-of-week-in-month",
    "day-in-week",
    "day-name",
    "day-abbreviation",
    "hour-in-day",
    "minute-in-hour",
    "second-in-minute",
    "seconds",
    "add",
    "add-duration",
    "difference",
    "duration",
    "sum",
  ],
};

describe("EXSLT registration", () => {
  it("should report every supported function as available", () => {
    for (const [prefix, names] of Object.entries(SUPPORTED)) {
      for (const name of names) {
        assert.strictEqual(
          valueOf(`function-available('${prefix}:${name}')`),
          "true",
          `${prefix}:${name}`,
        );
      }
    }
  });

  it("should register exactly the libexslt functions", () => {
    const namespaces = {
      exsl: EXSLT_COMMON,
      math: EXSLT_MATH,
      set: EXSLT_SETS,
      str: EXSLT_STRINGS,
      date: EXSLT_DATES,
    };
    const expected = Object.entries(SUPPORTED)
      .flatMap(([prefix, names]) =>
        names.map((name) => `{${namespaces[prefix]}}${name}`),
      )
      .filter((key) => key !== `{${EXSLT_COMMON}}node-set`)
      .concat(`{${EXSLT_DYNAMIC}}evaluate`);
    assert.deepStrictEqual(
      Object.keys(createExsltFunctions(new XsltEngine())).sort(),
      expected.sort(),
    );
  });

  it("should keep unknown EXSLT functions unknown", () => {
    const unknown = [
      "date:format-date('2001-01-01', 'yyyy')",
      "date:parse-date('x', 'y')",
      "math:nonesuch()",
      "str:nonesuch()",
      "set:nonesuch()",
      "dyn:map(/, '.')",
    ];
    for (const call of unknown) {
      assert.throws(() => valueOf(call), /Unknown function/, call);
    }
    assert.strictEqual(
      valueOf("function-available('date:format-date')"),
      "false",
    );
  });
});
