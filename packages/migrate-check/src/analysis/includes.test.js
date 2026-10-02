import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dirnameOf,
  markIncludes,
  normalizePath,
  resolveHref,
} from "./includes.js";

describe("resolveHref", () => {
  it("resolves relative, root-relative and query hrefs; skips URLs", () => {
    assert.equal(
      resolveHref("public/a.xml", "../styles/a.xsl"),
      "styles/a.xsl",
    );
    assert.equal(
      resolveHref("public/a.xml", "/styles/a.xsl?v=2"),
      "styles/a.xsl",
    );
    assert.equal(resolveHref("a.xml", "b.xsl#x"), "b.xsl");
    assert.equal(resolveHref("a.xml", "./x/../b.xsl"), "b.xsl");
    assert.equal(resolveHref("a.xml", "https://cdn.example/a.xsl"), null);
    assert.equal(resolveHref("a.xml", ""), null);
  });
});

describe("path helpers", () => {
  it("normalizes like posix.normalize for relative paths", () => {
    assert.equal(normalizePath("a//b/./c/../d"), "a/b/d");
    assert.equal(normalizePath("../../x"), "../../x");
    assert.equal(normalizePath("a/.."), ".");
    assert.equal(dirnameOf("a/b/c.xsl"), "a/b");
    assert.equal(dirnameOf("c.xsl"), ".");
  });
});

describe("markIncludes", () => {
  it("marks each reference found, missing or remote", () => {
    const sheets = [
      {
        file: "xsl/main.xsl",
        includes: [
          { href: "base.xsl" },
          { href: "gone.xsl" },
          { href: "http://x/a.xsl" },
        ],
      },
      { file: "other.xsl", includes: [] },
    ];
    markIncludes(sheets, (path) => path === "xsl/base.xsl");
    assert.deepEqual(
      sheets[0].includes.map((include) => include.found),
      [true, false, null],
    );
  });
});
