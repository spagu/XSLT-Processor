/**
 * Unit tests of the parse-only stage verdicts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyParse, isStaticError } from "./parseStage.mjs";

const a = (kind, extra = {}) => ({ kind, value: "", children: [], ...extra });
const error = (code) => a("error", { code });
const anyOf = (...children) => ({ kind: "any-of", value: "", children });
const thrown = (code, message = "m") => ({ error: { code, message } });

describe("classifyParse", () => {
  it("passes syntax error tests when the parser raises XPST0003", () => {
    assert.equal(
      classifyParse(error("XPST0003"), thrown("XPST0003")).status,
      "pass",
    );
    assert.equal(classifyParse(error("XPST0003"), {}).status, "fail");
    assert.equal(
      classifyParse(anyOf(error("XPST0003"), a("assert-true")), {}).status,
      "pass",
    );
  });

  it("passes value tests when parsing succeeds and fails them when it throws", () => {
    assert.equal(classifyParse(a("assert-eq"), {}).status, "pass");
    assert.equal(classifyParse(null, {}).status, "pass");
    assert.match(
      classifyParse(a("assert-eq"), thrown("XPST0003")).reason,
      /rejected a valid/,
    );
    assert.match(
      classifyParse(a("assert-eq"), thrown(undefined)).reason,
      /parser crashed/,
    );
  });

  it("handles dynamic, other static and wildcard errors", () => {
    assert.equal(classifyParse(error("FOAR0001"), {}).status, "pass");
    assert.equal(classifyParse(error("*"), {}).status, "pass");
    assert.equal(classifyParse(error("XPST0017"), {}).status, "not-run");
    assert.equal(
      classifyParse(error("XPST0017"), thrown("XPST0017")).status,
      "pass",
    );
    assert.equal(
      classifyParse(error("FOAR0001"), thrown("XPST0003")).status,
      "error-mismatch",
    );
    assert.equal(isStaticError("err:XQST0039"), true);
    assert.equal(isStaticError("XPTY0004"), false);
  });
});
