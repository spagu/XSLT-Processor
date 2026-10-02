import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { confinedPath, readConfined } from "./files.js";
import { createFixture, removeFixture } from "../../../test/fixtures.js";

describe("confinedPath and readConfined", () => {
  it("reads files inside the project and refuses the rest", async () => {
    const dir = await createFixture({ "a/b.xsl": "<b/>" });
    try {
      const base = pathToFileURL(join(dir, "a/x.xsl")).href;
      assert.equal(readConfined(dir, "b.xsl", base), "<b/>");
      assert.equal(
        confinedPath(dir, "..", `${pathToFileURL(dir).href}/a/`),
        `${dir}/`,
      );
      assert.equal(confinedPath(dir, pathToFileURL(dir).href, base), dir);
      assert.throws(
        () => confinedPath(dir, "../../etc/passwd", base),
        /outside/,
      );
      assert.throws(
        () => confinedPath(dir, "http://x/a.xsl", base),
        /not a local file/,
      );
    } finally {
      await removeFixture(dir);
    }
  });
});
