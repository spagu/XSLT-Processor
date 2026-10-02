import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeStylesheet, pluralize, summarizeVersions } from "./format.js";
import { sheetFacts } from "../test/fixtures.js";

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
  it("names only the version for a plain stylesheet", () => {
    assert.equal(describeStylesheet(sheetFacts()), "XSLT 1.0");
    assert.equal(
      describeStylesheet(sheetFacts({ version: "unknown" })),
      "unknown version",
    );
  });

  it("lists every flag that is set", () => {
    const all = sheetFacts({
      version: "3.0",
      exslt: true,
      exsltModules: ["common", "functions"],
      unsupportedExslt: ["date:format-date"],
      disableOutputEscaping: true,
      documentFunction: true,
      key: true,
      msxml: true,
      msxmlScript: true,
      msxmlFunctions: ["msxsl:format-date"],
      extensionFunctions: ["saxon:eval"],
      extensionNamespaces: ["urn:x"],
      includes: [
        { kind: "xsl:import", href: "gone.xsl", line: 2, found: false },
        { kind: "xsl:include", href: "here.xsl", line: 3, found: true },
      ],
    });
    assert.equal(
      describeStylesheet(all),
      "XSLT 3.0, EXSLT common, functions, unsupported date:format-date, disable-output-escaping, document(), xsl:key, MSXML msxsl:script, msxsl:format-date: no browser runtime runs them, extensions saxon:eval, urn:x, missing gone.xsl",
    );
  });

  it("names msxsl:node-set when MSXML is only used for it", () => {
    assert.equal(
      describeStylesheet(sheetFacts({ msxml: true })),
      "XSLT 1.0, msxsl:node-set",
    );
  });
});
