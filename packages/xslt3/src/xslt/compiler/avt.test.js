import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorCode } from "../testing.test.js";
import { parseAvt } from "./avt.js";

describe("attribute value templates", () => {
  it("split literal text and expressions", () => {
    assert.deepEqual(parseAvt("a{1}b{{c}}"), ["a", { expr: "1" }, "b{c}"]);
    assert.deepEqual(parseAvt(""), [""]);
    assert.deepEqual(parseAvt("{'}'}"), [{ expr: "'}'" }]);
    assert.deepEqual(parseAvt('{"{"}'), [{ expr: '"{"' }]);
    assert.deepEqual(parseAvt("{(: } (: } :) :) 1}"), [
      { expr: "(: } (: } :) :) 1" },
    ]);
    assert.deepEqual(parseAvt("{map{1:2}?1}"), [{ expr: "map{1:2}?1" }]);
  });

  it("report unbalanced brackets", () => {
    assert.equal(
      errorCode(() => parseAvt("{1")),
      "XTSE0350",
    );
    assert.equal(
      errorCode(() => parseAvt("{'1}")),
      "XTSE0350",
    );
    assert.equal(
      errorCode(() => parseAvt("{(: 1}")),
      "XTSE0350",
    );
    // XSLT 3.0: an empty expression, or only comments, stands for ""
    assert.deepEqual(parseAvt("{ }"), [""]);
    assert.deepEqual(parseAvt("x{ (: a (: b :) :) }y{1}"), [
      "xy",
      { expr: "1" },
    ]);
    assert.equal(
      errorCode(() => parseAvt("a}b")),
      "XTSE0370",
    );
  });
});
