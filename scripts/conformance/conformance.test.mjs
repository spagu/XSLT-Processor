/**
 * Unit tests of the conformance runner helpers (no corpus needed).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TextEncoder } from "node:util";
import {
  canonicalDeclaration,
  decodeExpected,
  firstDifference,
  normalizeOutput,
  sortAttributes,
} from "./normalize.mjs";
import { categoryOf } from "./cases.mjs";
import { buildBaseline, classify, compareWithBaseline } from "./classify.mjs";
import { passRate, renderMarkdown, summarize } from "./report.mjs";
import { isIndented } from "./runCase.mjs";

const encoder = new TextEncoder();

describe("normalizeOutput", () => {
  it("treats a missing encoding as UTF-8 and compares labels case-insensitively", () => {
    assert.equal(
      normalizeOutput('<?xml version="1.0"?>\n<a/>\n'),
      normalizeOutput('<?xml version="1.0" encoding="utf-8"?><a/>'),
    );
  });

  it("keeps the standalone pseudo-attribute", () => {
    assert.equal(
      canonicalDeclaration(' version="1.0" standalone="yes"'),
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n',
    );
  });

  it("turns CR LF into LF and drops trailing whitespace only", () => {
    assert.equal(normalizeOutput("a \r\nb\r\n\n"), "a \nb");
  });

  it("counts a declaration-only output as empty", () => {
    assert.equal(normalizeOutput('<?xml version="1.0"?>\n  \n'), "");
  });

  it("sorts attributes but keeps their values", () => {
    assert.equal(sortAttributes('<a y="1" x="2"/>'), '<a x="2" y="1"/>');
    assert.equal(sortAttributes("<a checked>"), "<a checked>");
  });

  it("equates the two HTML Content-Type meta forms", () => {
    assert.equal(
      normalizeOutput(
        '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>',
      ),
      normalizeOutput('<head><meta charset="UTF-8"></head>'),
    );
  });

  it("removes whitespace between tags only for indented output", () => {
    assert.equal(normalizeOutput("<a>\n  <b/>\n</a>"), "<a>\n  <b/>\n</a>");
    assert.equal(
      normalizeOutput("<a>\n  <b/>\n</a>", { markupWhitespace: true }),
      "<a><b/></a>",
    );
    assert.equal(
      normalizeOutput("<a> x </a>", { markupWhitespace: true }),
      "<a> x </a>",
    );
  });
});

describe("decodeExpected", () => {
  it("uses the declared encoding, then the fallback, then UTF-8", () => {
    const latin1 = Uint8Array.from([
      0x3c, 0x61, 0x3e, 0xe9, 0x3c, 0x2f, 0x61, 0x3e,
    ]);
    const declared = new Uint8Array([
      ...encoder.encode('<?xml version="1.0" encoding="ISO-8859-1"?>'),
      ...latin1,
    ]);
    assert.match(decodeExpected(declared), /<a>é<\/a>$/);
    assert.equal(decodeExpected(latin1, "iso-8859-1"), "<a>é</a>");
    assert.equal(decodeExpected(encoder.encode("<a>é</a>")), "<a>é</a>");
  });

  it("falls back to latin1 for unknown labels", () => {
    const bytes = encoder.encode(
      '<?xml version="1.0" encoding="x-unknown"?><a/>',
    );
    assert.match(decodeExpected(bytes), /<a\/>$/);
  });
});

describe("firstDifference", () => {
  it("returns null for equal strings and the offset otherwise", () => {
    assert.equal(firstDifference("abc", "abc"), null);
    assert.deepEqual(firstDifference("abcd", "abXd", 1, 2), {
      offset: 2,
      expected: "bcd",
      actual: "bXd",
    });
  });
});

describe("categoryOf", () => {
  it("maps REC cases to their spec chapter", () => {
    assert.equal(categoryOf("REC", "test-7.1.4-1"), "REC §7");
    assert.equal(categoryOf("REC", "stand-2.7-1"), "REC §2");
    assert.equal(categoryOf("REC", "other"), "REC");
    assert.equal(categoryOf("general", "bug-1-"), "general");
  });
});

describe("classify", () => {
  const testCase = {
    id: "general/x",
    category: "general",
    expected: "x.out",
    expectsError: false,
  };
  const read = () => encoder.encode('<?xml version="1.0"?>\n<a/>\n');
  const outcome = (output, extra = {}) => ({
    output,
    error: output === null ? "boom" : null,
    diagnostics: [],
    indented: false,
    encoding: "UTF-8",
    ...extra,
  });

  it("passes matching output", () => {
    const result = classify(
      testCase,
      outcome('<?xml version="1.0" encoding="UTF-8"?>\n<a/>'),
      new Map(),
      read,
    );
    assert.equal(result.status, "pass");
  });

  it("fails differing output with the first difference", () => {
    const result = classify(testCase, outcome("<b/>"), new Map(), read);
    assert.equal(result.status, "fail");
    assert.equal(result.difference.offset, 1);
  });

  it("reports an error when the processor fails but libxslt succeeds", () => {
    const result = classify(testCase, outcome(null), new Map(), read);
    assert.deepEqual([result.status, result.reason], ["error", "boom"]);
  });

  it("expects a failure when libxslt rejects the case", () => {
    const rejecting = { ...testCase, expected: null, expectsError: true };
    assert.equal(classify(rejecting, outcome(null)).status, "pass");
    assert.equal(classify(rejecting, outcome("<a/>")).status, "fail");
  });

  it("expects an empty result when libxslt writes no output file", () => {
    const empty = { ...testCase, expected: null };
    assert.equal(
      classify(empty, outcome('<?xml version="1.0"?>\n')).status,
      "pass",
    );
    assert.equal(classify(empty, outcome("text")).status, "fail");
  });

  it("skips excluded cases unless they pass", () => {
    const exclusions = new Map([["general/x", "implementation-defined"]]);
    const skipped = classify(testCase, outcome("<b/>"), exclusions, read);
    assert.deepEqual(
      [skipped.status, skipped.reason],
      ["skip", "implementation-defined"],
    );
    assert.equal(
      classify(testCase, outcome('<?xml version="1.0"?><a/>'), exclusions, read)
        .status,
      "pass",
    );
  });
});

describe("baseline", () => {
  const results = [
    { id: "a", category: "c", status: "pass" },
    { id: "b", category: "c", status: "fail" },
    { id: "c", category: "d", status: "error" },
    { id: "d", category: "d", status: "skip" },
  ];

  it("finds regressions, fixed and stale cases", () => {
    assert.deepEqual(compareWithBaseline(results, ["a", "b", "gone"]), {
      regressions: ["c"],
      fixed: ["a"],
      stale: ["gone"],
    });
  });

  it("records fail and error cases as known failures", () => {
    assert.deepEqual(buildBaseline(results, "corpus 1"), {
      corpus: "corpus 1",
      total: 4,
      passed: 1,
      skipped: 1,
      knownFailures: ["b", "c"],
    });
  });

  it("summarizes per category and renders Markdown", () => {
    const summary = summarize(results);
    assert.deepEqual(summary.at(-1), {
      category: "total",
      total: 4,
      pass: 1,
      fail: 1,
      error: 1,
      skip: 1,
    });
    assert.equal(passRate(summary.at(-1)), "33.3%");
    assert.equal(passRate({ total: 1, skip: 1, pass: 0 }), "n/a");
    const markdown = renderMarkdown({
      corpus: "corpus 1",
      summary,
      results: [
        ...results,
        {
          id: "e",
          category: "c",
          status: "fail",
          difference: { offset: 3, expected: "a|b", actual: "`x`" },
        },
      ],
      comparison: compareWithBaseline(results, ["a"]),
    });
    assert.match(markdown, /Pass rate: \*\*33\.3%\*\*/);
    assert.match(markdown, /## Regressions/);
    assert.match(markdown, /## Newly passing/);
    assert.match(markdown, /a\\\|b/);
  });

  it("sorts REC chapters numerically", () => {
    const summary = summarize([
      { id: "x", category: "REC §10", status: "pass" },
      { id: "y", category: "REC §2", status: "pass" },
    ]);
    assert.deepEqual(
      summary.map((row) => row.category),
      ["REC §2", "REC §10", "total"],
    );
  });
});

describe("isIndented", () => {
  it("treats indent=yes and HTML output as indented", () => {
    assert.equal(isIndented({ indent: "yes", method: "xml" }, "<a/>"), true);
    assert.equal(isIndented({ indent: "no", method: "html" }, "<p/>"), true);
    assert.equal(
      isIndented(
        { indent: "no", method: null },
        "<!DOCTYPE html><html></html>",
      ),
      true,
    );
    assert.equal(isIndented({ indent: "no", method: null }, "<a/>"), false);
  });
});
