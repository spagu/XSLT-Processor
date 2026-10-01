import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { VERSION } from "./index.js";

describe("@tradik/xslt3", () => {
  it("exports the version of package.json", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    assert.equal(VERSION, pkg.version);
  });
});
