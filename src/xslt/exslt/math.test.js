/**
 * EXSLT math module tests. Expected values follow libexslt `math.c`.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { XPathEvaluator } from "../../xpath/evaluator.js";
import { assertValues, runTemplate, valueOf } from "./exsltHarness.test.js";
import { createMathFunctions, mathConstant, mathPower } from "./math.js";

const NUMBERS = "<r><n>3</n><n>1</n><n>3</n><n>2</n><x>a</x><e/></r>";

describe("math:min() / math:max()", () => {
  it("should follow libexslt on a table of node-sets", () => {
    assertValues(
      [
        ["math:min(//n)", "1"],
        ["math:max(//n)", "3"],
        ["math:min(//none)", "NaN"],
        ["math:max(//none)", "NaN"],
        ["math:min(//n | //x)", "NaN"],
        ["math:max(//x | //n)", "NaN"],
        ["math:max(//n[1])", "3"],
      ],
      { xml: NUMBERS },
    );
  });

  it("should accept a result tree fragment as a node-set", () => {
    const out = runTemplate(
      '<xsl:variable name="v"><a>5</a></xsl:variable><xsl:value-of select="math:max($v)"/>',
    );
    assert.strictEqual(out, "5");
  });

  it("should reject non node-set arguments and wrong arity", () => {
    assert.throws(
      () => valueOf("math:max('1')"),
      /math:max\(\) expects a node-set/,
    );
    assert.throws(
      () => valueOf("math:min()"),
      /math:min\(\) expects 1 argument/,
    );
  });
});

describe("math:highest() / math:lowest()", () => {
  it("should return every node holding the extreme value", () => {
    assertValues(
      [
        ["count(math:highest(//n))", "2"],
        ["count(math:lowest(//n))", "1"],
        ["math:lowest(//n)", "1"],
        ["count(math:highest(//n | //x))", "0"],
        ["count(math:lowest(//none))", "0"],
        ["count(math:highest(//e))", "0"],
      ],
      { xml: NUMBERS },
    );
  });

  it("should return the nodes themselves, in document order", () => {
    assert.strictEqual(
      valueOf("count(math:highest(//n)[1]/following-sibling::n)", {
        xml: NUMBERS,
      }),
      "3",
    );
  });
});

describe("math:constant()", () => {
  it("should truncate the constant text to the precision", () => {
    assertValues([
      ["math:constant('PI', 4)", "3.14"],
      ["math:constant('PI', 1)", "3"],
      ["math:constant('PI', 1.9)", "3"],
      ["math:constant('PI', 0)", "NaN"],
      ["math:constant('PI', number('x'))", "NaN"],
      ["math:constant('E', 100)", "2.718281828459045"],
      ["math:constant('SQRRT2', 5)", "1.414"],
      ["math:constant('LN2', 4)", "0.69"],
      ["math:constant('LN10', 3)", "2.3"],
      ["math:constant('LOG2E', 6)", "1.4426"],
      ["math:constant('SQRT1_2', 5)", "0.707"],
      ["math:constant('pi', 4)", "NaN"],
      ["math:constant('toString', 4)", "NaN"],
    ]);
  });

  it("should be callable directly", () => {
    assert.strictEqual(mathConstant("PI", 3), 3.1);
    assert.ok(Number.isNaN(mathConstant("PI", Number.NaN)));
  });
});

describe("math:power()", () => {
  it("should use C pow() semantics", () => {
    assertValues([
      ["math:power(2, 10)", "1024"],
      ["math:power(2, -1)", "0.5"],
      ["math:power(1, 1 div 0)", "1"],
      ["math:power(-1, -1 div 0)", "1"],
      ["math:power(1, number('x'))", "NaN"],
      ["math:power(number('x'), 0)", "NaN"],
      ["math:power(-8, 1 div 3)", "NaN"],
      ["math:power('3', '2')", "9"],
    ]);
    assert.strictEqual(mathPower(0, -1), Infinity);
  });
});

describe("math unary functions", () => {
  it("should compute each function, NaN for NaN", () => {
    assertValues([
      ["math:abs(-2.5)", "2.5"],
      ["math:abs('x')", "NaN"],
      ["math:sqrt(16)", "4"],
      ["math:sqrt(-1)", "NaN"],
      ["math:log(1)", "0"],
      ["math:log(0)", "-Infinity"],
      ["math:exp(0)", "1"],
      ["math:sin(0)", "0"],
      ["math:cos(0)", "1"],
      ["math:tan(0)", "0"],
      ["math:asin(1)", "1.5707963267948966"],
      ["math:acos(1)", "0"],
      ["math:atan(1)", "0.7853981633974483"],
      ["math:atan2(1, 0)", "1.5707963267948966"],
      ["math:atan2(number('x'), 1)", "NaN"],
      ["math:acos(2)", "NaN"],
    ]);
  });

  it("should check the arity of every function", () => {
    assert.throws(() => valueOf("math:abs()"), /math:abs\(\) expects 1/);
    assert.throws(() => valueOf("math:atan2(1)"), /math:atan2\(\) expects 2/);
    assert.throws(() => valueOf("math:power(1)"), /math:power\(\) expects 2/);
    assert.throws(() => valueOf("math:constant('PI')"), /expects 2/);
    assert.throws(() => valueOf("math:random(1)"), /expects 0/);
  });
});

describe("math:random()", () => {
  it("should return a number between 0 and 1", () => {
    const value = Number(valueOf("math:random()"));
    assert.ok(value >= 0 && value <= 1);
  });

  it("should use an injected generator", () => {
    const functions = createMathFunctions(new XPathEvaluator(), {
      random: () => 0.25,
    });
    assert.strictEqual(
      functions["{http://exslt.org/math}random"]([], {}),
      0.25,
    );
  });
});
