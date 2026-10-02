import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectXmlStylesheetPi,
  isStylesheetHead,
  lineAt,
  readAttribute,
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

describe("lineAt and readAttribute", () => {
  it("counts lines up to an offset", () => {
    assert.equal(lineAt("a\nb\nc", 0), 1);
    assert.equal(lineAt("a\nb\nc", 4), 3);
  });

  it("reads quoted pseudo-attributes and returns null when absent", () => {
    assert.equal(readAttribute(` href = 'a.xsl' type="x"`, "href"), "a.xsl");
    assert.equal(readAttribute(' type="x"', "href"), null);
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
