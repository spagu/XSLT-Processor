import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderHtml } from "../report/html.js";
import { CONTEXT_LINES, detectUsages, methodOf, methodsUsed } from "./code.js";
import { analyze } from "./index.js";
import { scanResult, usage } from "../../test/fixtures.js";

describe("detectUsages", () => {
  it("records every API line once with its line number and method", () => {
    const source = [
      "const p = new XSLTProcessor();",
      "p.importStylesheet(xsl);",
      "const frag = p.transformToFragment(doc, document);",
      "const out = p.transformToDocument(doc);",
      "p.setParameter(null, 'a', 1);",
      "nothing here",
    ].join("\n");
    const { matches, migrated, domParser } = detectUsages(source, ".js");
    assert.deepEqual(
      matches.map((m) => [m.line, m.method]),
      [
        [1, "XSLTProcessor"],
        [2, "importStylesheet"],
        [3, "transformToFragment"],
        [4, "transformToDocument"],
        [5, "setParameter"],
      ],
    );
    assert.equal(matches[0].text, "const p = new XSLTProcessor();");
    assert.equal(migrated, false);
    assert.deepEqual(domParser, []);
  });

  it("counts setParameter only in a file that uses the API", () => {
    const other = "url.searchParams; api.setParameter('x', 1);";
    assert.deepEqual(detectUsages(other, ".js").matches, []);
  });

  it("ignores lines that are comments", () => {
    const source = [
      "// const p = new XSLTProcessor();",
      " * XSLTProcessor in a doc comment",
      "/* XSLTProcessor */",
      "# XSLTProcessor in php",
      "   const real = new XSLTProcessor();",
    ].join("\r\n");
    const { matches } = detectUsages(source, ".php");
    assert.deepEqual(matches, [
      {
        line: 5,
        text: "const real = new XSLTProcessor();",
        method: "XSLTProcessor",
      },
    ]);
  });

  it("flags files that already load @tradik/xslt-processor", () => {
    const viaImport = `import "@tradik/xslt-processor/polyfill";\nnew XSLTProcessor()`;
    assert.equal(detectUsages(viaImport, ".js").migrated, true);
    const viaGlobal = "const { XSLTProcessor } = XsltProcessorLib;";
    assert.equal(detectUsages(viaGlobal, ".js").migrated, true);
    assert.equal(detectUsages(viaGlobal, ".js").matches.length, 1);
  });

  it("matches XSL links and xml-stylesheet instructions in HTML only", () => {
    const html = `<link type="text/xsl" href="a.xsl">\n<?xml-stylesheet type='text/xsl' href='b.xsl'?>\n<p>text</p>`;
    const { matches } = detectUsages(html, ".htm");
    assert.deepEqual(
      matches.map((m) => [m.line, m.method]),
      [
        [1, "link"],
        [2, "link"],
      ],
    );
    assert.deepEqual(detectUsages(html, ".js").matches, []);
  });

  it("keeps DOMParser lines near an XSLT call as context only", () => {
    const far = Array.from({ length: CONTEXT_LINES + 5 }, () => "x;");
    const source = [
      "const parser = new DOMParser();",
      "// new DOMParser() in a comment",
      "const p = new XSLTProcessor();",
      ...far,
      "const lonely = new DOMParser();",
    ].join("\n");
    const { domParser } = detectUsages(source, ".js");
    assert.deepEqual(domParser, [
      { line: 1, text: "const parser = new DOMParser();" },
    ]);
    assert.deepEqual(detectUsages("const parser = new DOMParser();", ".js"), {
      matches: [],
      migrated: false,
      domParser: [],
    });
  });
});

describe("the tool's own report", () => {
  it("is skipped, though it quotes XSLTProcessor", () => {
    const html = renderHtml(
      analyze(scanResult({ usages: [usage("a.js", 1)] }), {
        version: "0.2.0",
        directory: "./",
        durationMs: 0,
      }),
    );
    assert.ok(html.includes("XSLTProcessor"));
    assert.deepEqual(detectUsages(html, ".html"), {
      matches: [],
      migrated: false,
      domParser: [],
    });
  });
});

describe("methodOf and methodsUsed", () => {
  it("names the member a line uses", () => {
    assert.equal(methodOf("p.importStylesheet(x)"), "importStylesheet");
    assert.equal(methodOf("new XSLTProcessor()"), "XSLTProcessor");
    assert.equal(methodOf('<link type="text/xsl">'), "link");
  });

  it("lists the API members once, constructor first, links left out", () => {
    const matches = [
      { method: "transformToDocument" },
      { method: "link" },
      { method: "XSLTProcessor" },
      { method: "transformToDocument" },
    ];
    assert.deepEqual(methodsUsed(matches), [
      "XSLTProcessor",
      "transformToDocument",
    ]);
    assert.deepEqual(methodsUsed([{ method: "link" }]), []);
  });
});
