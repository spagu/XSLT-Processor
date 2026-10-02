import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectStylesheet,
  detectUsages,
  detectXmlStylesheetPi,
  isStylesheetHead,
  trimLine,
} from "./detectors.js";
import { stylesheetXml } from "../test/fixtures.js";

describe("trimLine", () => {
  it("trims whitespace and cuts long lines to 100 characters", () => {
    assert.equal(trimLine("  const x = 1;  "), "const x = 1;");
    const long = "a".repeat(150);
    const cut = trimLine(long);
    assert.equal(cut.length, 100);
    assert.ok(cut.endsWith("…"));
    assert.equal(trimLine("b".repeat(100)), "b".repeat(100));
  });
});

describe("detectUsages", () => {
  it("records every pattern once per line with its line number", () => {
    const source = [
      "const p = new XSLTProcessor();",
      "p.importStylesheet(xsl);",
      "const frag = p.transformToFragment(doc, document);",
      "const out = p.transformToDocument(doc);",
      "p.importStylesheet(a); p.transformToDocument(b);",
      "nothing here",
    ].join("\n");
    const { matches, migrated } = detectUsages(source, ".js");
    assert.deepEqual(
      matches.map((m) => m.line),
      [1, 2, 3, 4, 5],
    );
    assert.equal(matches[0].text, "const p = new XSLTProcessor();");
    assert.equal(migrated, false);
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
      { line: 5, text: "const real = new XSLTProcessor();" },
    ]);
  });

  it("flags files that already load @tradik/xslt-processor", () => {
    const viaCdn = `<script src="https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/x.js"></script>\nnew XSLTProcessor()`;
    assert.equal(detectUsages(viaCdn, ".html").migrated, true);
    const viaGlobal = "const { XSLTProcessor } = XsltProcessorLib;";
    assert.equal(detectUsages(viaGlobal, ".js").migrated, true);
    assert.equal(detectUsages(viaGlobal, ".js").matches.length, 1);
  });

  it("matches XSL links and xml-stylesheet instructions in HTML only", () => {
    const html = `<link type="text/xsl" href="a.xsl">\n<?xml-stylesheet type='text/xsl' href='b.xsl'?>\n<p>text</p>`;
    assert.deepEqual(
      detectUsages(html, ".htm").matches.map((m) => m.line),
      [1, 2],
    );
    assert.deepEqual(detectUsages(html, ".js").matches, []);
  });
});

describe("isStylesheetHead", () => {
  it("recognises xsl:stylesheet and xsl:transform roots", () => {
    assert.equal(isStylesheetHead(stylesheetXml()), true);
    assert.equal(
      isStylesheetHead('<xsl:transform version="1.0" xmlns:xsl="x">'),
      true,
    );
    assert.equal(isStylesheetHead("<root><xsl:stylesheetish/></root>"), false);
    assert.equal(isStylesheetHead("<feed/>"), false);
  });
});

describe("detectStylesheet", () => {
  it("reads the version and finds no flags in a plain stylesheet", () => {
    assert.deepEqual(detectStylesheet(stylesheetXml("1.0")), {
      version: "1.0",
      exslt: false,
      disableOutputEscaping: false,
      documentFunction: false,
      key: false,
      msxml: false,
    });
  });

  it("accepts single quotes and spaces around the equals sign", () => {
    const sheet = "<xsl:stylesheet xmlns:xsl='x' version = '2.0'>";
    assert.equal(detectStylesheet(sheet).version, "2.0");
  });

  it("reports unknown when the root or its version is missing", () => {
    assert.equal(detectStylesheet("<not-xslt/>").version, "unknown");
    assert.equal(detectStylesheet(stylesheetXml("")).version, "unknown");
  });

  it("sets each flag", () => {
    const extra = [
      '<xsl:key name="k" match="x" use="@id"/>',
      '<xsl:value-of select="document(\'a.xml\')" disable-output-escaping="yes"/>',
      '<xsl:value-of select="exsl:node-set($x)" xmlns:exsl="http://exslt.org/common"/>',
      '<xsl:value-of select="msxsl:node-set($y)" xmlns:msxsl="urn:schemas-microsoft-com:xslt"/>',
    ].join("\n");
    const facts = detectStylesheet(stylesheetXml("3.0", extra));
    assert.deepEqual(facts, {
      version: "3.0",
      exslt: true,
      disableOutputEscaping: true,
      documentFunction: true,
      key: true,
      msxml: true,
    });
    const urnOnly = stylesheetXml("1.0", "urn:schemas-microsoft-com:xslt");
    assert.equal(detectStylesheet(urnOnly).msxml, true);
  });
});

describe("detectXmlStylesheetPi", () => {
  it("returns null without an instruction or with one the browser ignores", () => {
    assert.equal(detectXmlStylesheetPi("<root/>"), null);
    assert.equal(
      detectXmlStylesheetPi('<?xml-stylesheet type="text/css" href="a.css"?>'),
      null,
    );
    assert.equal(
      detectXmlStylesheetPi('<?xml-stylesheet href="a.xsl"?>'),
      null,
    );
  });

  it("returns the line, href and type of an XSLT instruction", () => {
    const head = `<?xml version="1.0"?>\n<!-- c -->\n<?xml-stylesheet type="text/xsl" href="../s.xsl?v=2"?>\n<root/>`;
    assert.deepEqual(detectXmlStylesheetPi(head), {
      line: 3,
      href: "../s.xsl?v=2",
      type: "text/xsl",
    });
  });

  it("accepts the other XSLT media types, any case, and a missing href", () => {
    assert.equal(
      detectXmlStylesheetPi(
        '<?xml-stylesheet type="application/xslt+xml" href="s"?>',
      ).type,
      "application/xslt+xml",
    );
    assert.deepEqual(
      detectXmlStylesheetPi("<?xml-stylesheet type='Application/XML'?>"),
      { line: 1, href: "", type: "Application/XML" },
    );
  });
});
