import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { URL } from "node:url";
import { readVersion } from "./migration.js";
import { VERSION } from "./version.js";

describe("VERSION", () => {
  it("equals the version in package.json", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    assert.equal(VERSION, manifest.version);
    assert.equal(readVersion(), VERSION);
  });
});
