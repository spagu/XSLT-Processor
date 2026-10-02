import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeStylesheet, pluralize, summarizeVersions } from "./format.js";

describe("pluralize", () => {
  it("picks the noun by count and groups thousands", () => {
    assert.equal(pluralize(1, "file"), "1 file");
    assert.equal(pluralize(0, "file"), "0 files");
    assert.equal(pluralize(1284, "file"), "1,284 files");
    assert.equal(pluralize(2, "entry", "entries"), "2 entries");
  });
});

describe("summarizeVersions", () => {
  it("counts each version in sorted order and names unknown ones", () => {
    const sheets = [
      { version: "2.0" },
      { version: "1.0" },
      { version: "unknown" },
      { version: "1.0" },
    ];
    assert.equal(
      summarizeVersions(sheets),
      "2 × XSLT 1.0, 1 × XSLT 2.0, 1 × unknown version",
    );
  });
});

describe("describeStylesheet", () => {
  const base = {
    version: "1.0",
    exslt: false,
    disableOutputEscaping: false,
    documentFunction: false,
    key: false,
    msxml: false,
  };

  it("names only the version for a plain stylesheet", () => {
    assert.equal(describeStylesheet(base), "XSLT 1.0");
    assert.equal(
      describeStylesheet({ ...base, version: "unknown" }),
      "unknown version",
    );
  });

  it("lists every flag that is set", () => {
    const all = {
      version: "3.0",
      exslt: true,
      disableOutputEscaping: true,
      documentFunction: true,
      key: true,
      msxml: true,
    };
    assert.equal(
      describeStylesheet(all),
      "XSLT 3.0, EXSLT, disable-output-escaping, document(), xsl:key, MSXML extension: will not work in any browser polyfill",
    );
  });
});
