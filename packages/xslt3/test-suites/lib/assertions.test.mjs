/**
 * Unit tests of every assertion kind, with fake engine helpers: values are
 * plain JavaScript values, `test` evaluates the generated XPath expression
 * by looking it up in a table.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotRunError, checkAssertion } from "./assertions.mjs";

const a = (kind, value = "", extra = {}) => ({
  kind,
  value,
  children: [],
  ...extra,
});
const of = (kind, ...children) => ({ kind, value: "", children });

/**
 * Helpers whose `test` answers from the value itself: the value is an
 * object mapping expressions to booleans.
 */
const helpers = {
  test: (expr, value) => {
    if (!(expr in value.answers)) throw new Error(`unexpected ${expr}`);
    return value.answers[expr];
  },
  stringValue: (value) => value.string,
  serialize: (value, params) => {
    if (value.serializationError) {
      throw Object.assign(new Error("ser"), { code: "SERE0014" });
    }
    return params.method === "text" ? value.string : value.xml;
  },
  readFile: (path) => `<from file="${path}"/>`,
};
const noEngine = {
  test: () => {
    throw new NotRunError("adapter has no evaluateXPath");
  },
  stringValue: () => "",
  serialize: () => {
    throw new NotRunError("adapter has no serialize");
  },
  readFile: () => "",
};
const ok = (value) => ({ value });
const failed = (code) => ({ error: { code, message: "boom" } });

describe("checkAssertion", () => {
  const value = {
    answers: { "empty($result)": true, "count($result) eq 2": false },
    string: "1 2",
    xml: "<out/>",
  };

  it("decides value assertions with the engine", () => {
    assert.equal(
      checkAssertion(a("assert-empty"), ok(value), helpers).status,
      "pass",
    );
    assert.deepEqual(
      checkAssertion(a("assert-count", "2"), ok(value), helpers),
      {
        status: "fail",
        reason: "assert-count",
      },
    );
    assert.equal(
      checkAssertion(a("assert-empty"), ok(value), noEngine).status,
      "not-run",
    );
  });

  it("checks string values, XML and serializations", () => {
    assert.equal(
      checkAssertion(a("assert-string-value", "1 2"), ok(value), helpers)
        .status,
      "pass",
    );
    const wrong = checkAssertion(
      a("assert-string-value", "3"),
      ok(value),
      helpers,
    );
    assert.deepEqual(wrong, { status: "fail", reason: 'string value "1 2"' });
    assert.equal(
      checkAssertion(a("assert-xml", "<out/>"), ok(value), helpers).status,
      "pass",
    );
    assert.equal(
      checkAssertion(a("assert-xml", "<x/>"), ok(value), helpers).status,
      "fail",
    );
    const fromFile = checkAssertion(
      a("assert-xml", "", { file: "/f" }),
      ok({ xml: '<from file="/f"/>' }),
      helpers,
    );
    assert.equal(fromFile.status, "pass");
    assert.equal(
      checkAssertion(a("serialization-matches", "^<out"), ok(value), helpers)
        .status,
      "pass",
    );
    assert.equal(
      checkAssertion(a("serialization-matches", "^x"), ok(value), helpers)
        .status,
      "fail",
    );
    const text = a("assert-serialization", "1 2", { method: "text" });
    assert.equal(checkAssertion(text, ok(value), helpers).status, "pass");
    assert.equal(
      checkAssertion(a("assert-serialization", "<out/>"), ok(value), helpers)
        .status,
      "pass",
    );
    assert.equal(
      checkAssertion(a("assert-xml", "<out/>"), ok(value), noEngine).status,
      "not-run",
    );
  });

  it("checks serialization errors", () => {
    const expected = a("assert-serialization-error", "", { code: "SERE0014" });
    assert.equal(
      checkAssertion(expected, ok({ serializationError: true }), helpers)
        .status,
      "pass",
    );
    assert.equal(checkAssertion(expected, ok(value), helpers).status, "fail");
    const other = a("assert-serialization-error", "", {
      code: "SERE0020",
      method: "html",
    });
    assert.equal(
      checkAssertion(other, ok({ serializationError: true }), helpers).status,
      "error-mismatch",
    );
    assert.equal(
      checkAssertion(expected, ok(value), noEngine).status,
      "not-run",
    );
  });

  it("checks errors", () => {
    assert.equal(
      checkAssertion(
        a("error", "", { code: "FOAR0001" }),
        failed("FOAR0001"),
        helpers,
      ).status,
      "pass",
    );
    assert.equal(
      checkAssertion(a("error", "", { code: "*" }), failed("XPTY0004"), helpers)
        .status,
      "pass",
    );
    assert.equal(
      checkAssertion(a("error"), failed("XPTY0004"), helpers).status,
      "pass",
    );
    assert.deepEqual(
      checkAssertion(
        a("error", "", { code: "FOAR0001" }),
        failed("FOAR0002"),
        helpers,
      ),
      {
        status: "error-mismatch",
        reason: "expected FOAR0001, got FOAR0002",
      },
    );
    assert.equal(
      checkAssertion(a("error", "", { code: "FOAR0001" }), ok(value), helpers)
        .status,
      "fail",
    );
    const unexpected = checkAssertion(
      a("assert-empty"),
      failed("FOER0000"),
      helpers,
    );
    assert.deepEqual(unexpected, {
      status: "fail",
      reason: "unexpected error FOER0000",
    });
    const noCode = checkAssertion(
      a("assert-empty"),
      { error: { message: "m" } },
      helpers,
    );
    assert.equal(noCode.reason, "unexpected error m");
  });

  it("combines any-of, all-of and not", () => {
    const pass = a("assert-empty");
    const fail = a("assert-count", "2");
    assert.equal(
      checkAssertion(of("any-of", fail, pass), ok(value), helpers).status,
      "pass",
    );
    assert.equal(
      checkAssertion(of("any-of", fail, fail), ok(value), helpers).status,
      "fail",
    );
    assert.equal(
      checkAssertion(of("all-of", pass, fail), ok(value), helpers).status,
      "fail",
    );
    assert.equal(
      checkAssertion(of("all-of", pass, pass), ok(value), helpers).status,
      "pass",
    );
    assert.equal(
      checkAssertion(of("not", fail), ok(value), helpers).status,
      "pass",
    );
    assert.equal(
      checkAssertion(of("not", pass), ok(value), helpers).status,
      "fail",
    );
    assert.equal(
      checkAssertion(of("not", pass), ok(value), noEngine).status,
      "not-run",
    );
    const mixed = of("any-of", a("error", "", { code: "X" }), fail);
    assert.equal(
      checkAssertion(mixed, failed("Y"), helpers).status,
      "error-mismatch",
    );
  });

  it("checks messages and result documents of transformations", () => {
    const message = of("assert-message", a("assert-string-value", "hi"));
    const outcome = { value, messages: [{ string: "no" }, { string: "hi" }] };
    assert.equal(checkAssertion(message, outcome, helpers).status, "pass");
    assert.equal(
      checkAssertion(message, { value, messages: [] }, helpers).status,
      "fail",
    );
    assert.equal(checkAssertion(message, { value }, helpers).status, "fail");
    const document = {
      ...of("assert-result-document", a("assert-string-value", "doc")),
      uri: "r.xml",
    };
    const docs = new Map([["r.xml", { string: "doc" }]]);
    assert.equal(
      checkAssertion(document, { value, resultDocuments: docs }, helpers)
        .status,
      "pass",
    );
    assert.equal(checkAssertion(document, { value }, helpers).status, "fail");
  });

  it("reports unsupported kinds, missing results and engine crashes", () => {
    assert.equal(checkAssertion(null, ok(value), helpers).status, "not-run");
    assert.equal(
      checkAssertion(a("assert-warning"), ok(value), helpers).status,
      "not-run",
    );
    const crash = checkAssertion(a("assert-true"), ok(value), helpers);
    assert.equal(crash.status, "fail");
    assert.match(crash.reason, /unexpected \$result instance of xs:boolean/);
  });
});
