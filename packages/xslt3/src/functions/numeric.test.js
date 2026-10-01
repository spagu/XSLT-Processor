import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mathFunctions, pow } from "./math.js";
import { numericFunctions, roundDecimal } from "./numeric.js";
import { qnameFunctions, makeQName } from "./qnames.js";
import { Decimal } from "../xdm/decimal.js";
import { MATH_NAMESPACE } from "./support.js";
import { call, checkDefinitions, one, throwsCode, v } from "./testing.test.js";

const f = (local, ...args) => call(numericFunctions, local, args);
/** Result as "type:value". */
const typed = (sequence) => {
  assert.equal(sequence.length, 1);
  return `${sequence[0].type.localName}:${one(sequence)}`;
};

describe("abs, ceiling and floor", () => {
  checkDefinitions(numericFunctions);

  it("keep the primitive numeric type", () => {
    assert.equal(typed(f("abs", 10n)), "integer:10");
    assert.equal(typed(f("abs", -10n)), "integer:10");
    assert.equal(typed(f("abs", v("positiveInteger", "3"))), "integer:3");
    assert.equal(typed(f("abs", v("decimal", "-10.5"))), "decimal:10.5");
    assert.equal(typed(f("abs", v("decimal", "1.5"))), "decimal:1.5");
    assert.equal(typed(f("abs", v("double", "-INF"))), "double:INF");
    assert.equal(typed(f("abs", v("float", "-1.5"))), "float:1.5");
    assert.deepEqual(f("abs", null), []);
  });

  it("round up and down (F&O examples)", () => {
    assert.equal(typed(f("ceiling", 10.5)), "double:11");
    assert.equal(typed(f("ceiling", -10.5)), "double:-10");
    assert.equal(typed(f("ceiling", -0.5)), "double:-0");
    assert.equal(typed(f("ceiling", v("decimal", "-10.5"))), "decimal:-10");
    assert.equal(typed(f("ceiling", v("decimal", "10.5"))), "decimal:11");
    assert.equal(typed(f("ceiling", 3n)), "integer:3");
    assert.equal(typed(f("floor", 10.5)), "double:10");
    assert.equal(typed(f("floor", -10.5)), "double:-11");
    assert.equal(typed(f("floor", v("decimal", "-10.5"))), "decimal:-11");
    assert.equal(typed(f("floor", 3n)), "integer:3");
  });
});

describe("round and round-half-to-even", () => {
  it("rounds half toward positive infinity (F&O examples)", () => {
    assert.equal(typed(f("round", 2.5)), "double:3");
    assert.equal(typed(f("round", 2.4999)), "double:2");
    assert.equal(typed(f("round", -2.5)), "double:-2");
    assert.equal(typed(f("round", -0.4)), "double:-0");
    assert.equal(typed(f("round", 0.49999999999999994)), "double:0");
    assert.equal(typed(f("round", v("decimal", "1.125"), 2n)), "decimal:1.13");
    assert.equal(typed(f("round", 8452n, -2n)), "integer:8500");
    assert.equal(typed(f("round", 8452n, 2n)), "integer:8452");
    assert.equal(typed(f("round", 3.1415, 2n)), "double:3.14");
    assert.equal(typed(f("round", v("float", "2.5"))), "float:3");
    assert.equal(typed(f("round", v("double", "NaN"))), "double:NaN");
    assert.equal(typed(f("round", v("double", "-0"))), "double:-0");
    assert.equal(typed(f("round", 1e300, 2n ** 70n)), "double:1.0E300");
    assert.equal(typed(f("round", 12345.6, -(2n ** 70n))), "double:0");
    assert.deepEqual(f("round", null), []);
  });

  it("rounds half to even (F&O examples)", () => {
    const e = (...args) => typed(f("round-half-to-even", ...args));
    assert.equal(e(0.5), "double:0");
    assert.equal(e(1.5), "double:2");
    assert.equal(e(2.5), "double:2");
    assert.equal(e(3.567812e3, 2n), "double:3567.81");
    assert.equal(e(4.7564e-3, 2n), "double:0");
    assert.equal(e(35612.25, -2n), "double:35600");
    assert.equal(e(v("decimal", "-1.5")), "decimal:-2");
    assert.equal(e(v("decimal", "-2.5")), "decimal:-2");
    assert.equal(e(v("float", "0.05"), 1n), "float:0.1");
    assert.equal(e(1250n, -2n), "integer:1200");
    assert.equal(e(1350n, -2n), "integer:1400");
  });

  it("rounds decimals exactly", () => {
    const d = (text) => Decimal.parse(text);
    assert.equal(roundDecimal(d("-1.25"), 1, false).toString(), "-1.2");
    assert.equal(roundDecimal(d("-1.26"), 1, false).toString(), "-1.3");
    assert.equal(roundDecimal(d("1.2"), 3, true).toString(), "1.2");
  });
});

describe("math functions", () => {
  checkDefinitions(mathFunctions);
  const m = (local, ...args) =>
    one(call(mathFunctions, local, args, {}, MATH_NAMESPACE));

  it("computes the IEEE functions (F&O examples)", () => {
    assert.equal(m("pi"), "3.141592653589793");
    assert.equal(m("exp", 1), "2.718281828459045");
    assert.equal(m("exp10", 0.5), "3.1622776601683795");
    assert.equal(m("log", 0), "-INF");
    assert.equal(m("log10", 1.0e-3), "-3");
    assert.equal(m("sqrt", -0), "-0");
    assert.equal(m("sin", 0), "0");
    assert.equal(m("cos", 0), "1");
    assert.equal(m("tan", 0), "0");
    assert.equal(m("asin", 2), "NaN");
    assert.equal(m("acos", 1), "0");
    assert.equal(m("atan", 0), "0");
    assert.equal(m("atan2", 0, -0), "3.141592653589793");
    assert.deepEqual(
      call(mathFunctions, "exp", [null], {}, MATH_NAMESPACE),
      [],
    );
  });

  it("follows the F&O special cases of pow", () => {
    assert.equal(m("pow", 2, 3n), "8");
    assert.equal(m("pow", -2, 3n), "-8");
    assert.equal(m("pow", 2, -3n), "0.125");
    assert.equal(m("pow", 0, -3n), "INF");
    assert.equal(m("pow", -0, -3n), "-INF");
    assert.equal(m("pow", 1, NaN), "1");
    assert.equal(m("pow", -1, Infinity), "1");
    assert.equal(m("pow", -1, NaN), "NaN");
    assert.equal(m("pow", 2, v("decimal", "0.5")), "1.4142135623730951");
    assert.equal(pow(NaN, 0), 1);
    assert.deepEqual(
      call(mathFunctions, "pow", [null, 1n], {}, MATH_NAMESPACE),
      [],
    );
  });
});

describe("QName functions", () => {
  checkDefinitions(qnameFunctions);
  const q = (local, ...args) => call(qnameFunctions, local, args);

  it("builds and takes apart QNames", () => {
    const name = q("QName", "http://www.example.com/example", "person")[0];
    assert.equal(name.type.localName, "QName");
    assert.equal(one(q("local-name-from-QName", name)), "person");
    assert.equal(
      one(q("namespace-uri-from-QName", name)),
      "http://www.example.com/example",
    );
    assert.deepEqual(q("prefix-from-QName", name), []);
    const prefixed = q(
      "QName",
      "http://www.example.com/example",
      "ht:person",
    )[0];
    assert.equal(one(q("prefix-from-QName", prefixed)), "ht");
    assert.equal(
      one(q("namespace-uri-from-QName", q("QName", null, "a")[0])),
      "",
    );
    for (const local of [
      "prefix-from-QName",
      "local-name-from-QName",
      "namespace-uri-from-QName",
    ]) {
      assert.deepEqual(q(local, null), []);
    }
  });

  it("rejects invalid lexical QNames", () => {
    throwsCode(() => makeQName("", "p:a"), "FOCA0002");
    throwsCode(() => makeQName("u", "a:b:c"), "FOCA0002");
    throwsCode(() => makeQName("u", "1a"), "FOCA0002");
    assert.equal(makeQName("u", "a").prefix, "");
  });
});
