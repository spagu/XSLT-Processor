import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { compileXPath, evaluateXPath, VERSION, XPathError } from "./index.js";

describe("@tradik/xslt3", () => {
  it("exports the version of package.json", () => {
    const pkg = JSON.parse(
      readFileSync(
        fileURLToPath(import.meta.resolve("../package.json")),
        "utf8",
      ),
    );
    assert.equal(VERSION, pkg.version);
  });

  it("exposes the XPath 3.1 API", () => {
    const [sum] = evaluateXPath("sum((1, 2, 3)) * 2", null);
    assert.equal(String(sum.value), "12");
    const square = compileXPath("$x * $x", { variables: ["x"] });
    const [nine] = square.evaluate(null, { variables: { x: 3n } });
    assert.equal(nine.value, 9n);
    assert.throws(() => evaluateXPath("1 +", null), XPathError);
  });
});
