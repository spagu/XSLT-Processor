// Shared helpers of the syntax tests: AST builders without offsets.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { XPathError } from "../../errors.js";
import { parseXPath } from "./index.js";

/**
 * Parses and removes the offsets, to compare trees structurally.
 *
 * @param {string} expression - XPath expression
 * @returns {object} The AST without start/end
 */
export function parse(expression) {
  return JSON.parse(
    JSON.stringify(parseXPath(expression), (key, value) =>
      key === "start" || key === "end" ? undefined : value,
    ),
  );
}

/** @returns {object} A QName */
export const qn = (local, prefix = null, uri = null) => ({
  prefix,
  local,
  uri,
});
/** @returns {object} A numeric literal */
export const num = (value, kind = "integer") => ({
  type: "NumericLiteral",
  kind,
  value,
});
/** @returns {object} A string literal */
export const str = (value) => ({ type: "StringLiteral", value });
/** @returns {object} A variable reference */
export const varRef = (local) => ({ type: "VarRef", name: qn(local) });
/** @returns {object} An axis step with a name test */
export const step = (local, axis = "child", predicates = []) => ({
  type: "AxisStep",
  axis,
  nodeTest: { type: "NameTest", name: qn(local) },
  predicates,
});
/** @returns {object} A step with any node test */
export const testStep = (axis, nodeTest, predicates = []) => ({
  type: "AxisStep",
  axis,
  nodeTest,
  predicates,
});
/** @returns {object} The `//` step */
export const dos = () =>
  testStep("descendant-or-self", { type: "AnyKindTest" });
/** @returns {object} A sequence type */
export const seqType = (itemType, occurrence = "") => ({
  type: "SequenceType",
  itemType,
  occurrence,
});
/** @returns {object} An atomic type */
export const atomic = (local, prefix = "xs") => ({
  type: "AtomicType",
  name: qn(local, prefix),
});

/**
 * Asserts that parsing fails with an XPathError: `assertError(e, /msg/)`
 * expects XPST0003, `assertError(e, "XPTY0004", /msg/)` another code.
 *
 * @param {string} expression - Expression
 * @param {string|RegExp} codeOrMessage - Expected code, or message pattern
 * @param {RegExp} [pattern] - Pattern the message must match
 */
export function assertError(expression, codeOrMessage, pattern) {
  const code = typeof codeOrMessage === "string" ? codeOrMessage : "XPST0003";
  const message = pattern ?? codeOrMessage;
  assert.throws(
    () => parseXPath(expression),
    (error) => {
      assert.ok(error instanceof XPathError, `${expression}: ${error}`);
      assert.equal(error.code, code, `${expression}: ${error.message}`);
      assert.match(error.message, message);
      return true;
    },
  );
}

describe("syntax test helpers", () => {
  it("strip offsets", () => {
    assert.deepEqual(parse("1"), num("1"));
  });
});
