import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { compileStylesheet, XSLTProcessor } from "./index.js";
import {
  createDocument,
  errorCode,
  parse,
  show,
  stylesheet,
} from "./testing.test.js";

const xsl = stylesheet(
  '<xsl:param name="p" select="0"/><xsl:param name="Q{urn:q}q" select="0"/>' +
    '<xsl:output method="xml" indent="yes" use-character-maps="m"/>' +
    '<xsl:character-map name="m"><xsl:output-character character="a" string="b"/></xsl:character-map>' +
    '<xsl:template match="/"><out p="{$p}" q="{$Q{urn:q}q}"><xsl:copy-of select="*"/></out></xsl:template>' +
    '<xsl:template name="t"><xsl:param name="x" select="1"/><t x="{$x}"/></xsl:template>' +
    '<xsl:function name="f:f" xmlns:f="urn:f"><xsl:param name="a"/><xsl:sequence select="$a * 2"/></xsl:function>',
);

describe("compileStylesheet", () => {
  it("compiles text and documents, and runs them", () => {
    const compiled = compileStylesheet(xsl, { parseXml: parse });
    const { principal, messages, secondary } = compiled.transform({
      source: parse("<doc/>"),
      params: { p: 1, "Q{urn:q}q": 2 },
    });
    assert.equal(show(principal), '<out p="1" q="2"><doc/></out>');
    assert.equal(principal.nodeType, 9);
    assert.deepEqual(messages, []);
    assert.equal(secondary.size, 0);
    assert.equal(compiled.output.method, "xml");
    assert.deepEqual([...compiled.output["use-character-maps"]], [["a", "b"]]);
    const again = compileStylesheet(parse(xsl));
    assert.equal(
      show(
        again.transform({
          source: parse("<doc/>"),
          params: new Map([["{}p", "x"]]),
        }).principal,
      ),
      '<out p="x" q="0"><doc/></out>',
    );
  });

  it("invokes named templates and functions", () => {
    const compiled = compileStylesheet(parse(xsl));
    assert.equal(
      show(
        compiled.transform({
          initialTemplate: "t",
          templateParams: { x: 5 },
          createDocument,
        }).principal,
      ),
      '<t x="5"/>',
    );
    assert.equal(
      show(
        compiled.transform({ initialTemplate: "Q{}t", createDocument })
          .principal,
      ),
      '<t x="1"/>',
    );
    assert.equal(
      show(
        compiled.transform({
          initialFunction: { name: "Q{urn:f}f", args: [21n] },
          createDocument,
        }).principal,
      ),
      "42",
    );
    assert.equal(
      errorCode(() =>
        compiled.transform({ initialFunction: { name: "{urn:f}g", args: [] } }),
      ),
      "XTDE0041",
    );
    assert.equal(
      errorCode(() => compiled.transform({ initialTemplate: "none" })),
      "XTDE0040",
    );
    assert.equal(
      errorCode(() => compiled.transform({ createDocument })),
      "XTDE0040",
    );
    assert.equal(
      errorCode(() => compiled.transform({ initialTemplate: "t" })),
      "XPDY0130",
    );
  });

  it("applies templates to a match selection, or needs a source", () => {
    const compiled = compileStylesheet(
      parse(
        stylesheet('<xsl:template match="."><i>{.}</i></xsl:template>', {
          attributes: 'expand-text="yes"',
        }),
      ),
    );
    assert.equal(
      show(
        compiled.transform({ initialMatchSelection: [1, "a"], createDocument })
          .principal,
      ),
      "<i>1</i><i>a</i>",
    );
    assert.equal(
      errorCode(() => compiled.transform({ initialMode: "{}m" })),
      "XTDE0044",
    );
  });

  it("uses the global DOM when there is no source or factory", () => {
    const compiled = compileStylesheet(
      parse(stylesheet('<xsl:template name="t"><a/></xsl:template>')),
    );
    globalThis.document = createDocument();
    try {
      assert.equal(
        show(compiled.transform({ initialTemplate: "t" }).principal),
        "<a/>",
      );
    } finally {
      delete globalThis.document;
    }
  });

  it("needs an XML parser for text", () => {
    assert.equal(
      errorCode(() => compileStylesheet(xsl)),
      "XTSE0165",
    );
    globalThis.DOMParser = DOMParser;
    try {
      assert.ok(compileStylesheet(xsl));
    } finally {
      delete globalThis.DOMParser;
    }
  });
});

describe("XSLTProcessor", () => {
  it("mirrors the browser API", () => {
    const processor = new XSLTProcessor({ parseXml: parse });
    assert.throws(
      () => processor.transformToDocument(parse("<doc/>")),
      /No stylesheet/,
    );
    processor.importStylesheet(xsl);
    processor.setParameter(null, "p", 3);
    processor.setParameter("urn:q", "q", 4);
    assert.equal(processor.getParameter(null, "p"), 3);
    assert.equal(
      show(processor.transformToDocument(parse("<doc/>"))),
      '<out p="3" q="4"><doc/></out>',
    );
    const owner = createDocument();
    const fragment = processor.transformToFragment(parse("<doc/>"), owner);
    assert.equal(fragment.nodeType, 11);
    assert.equal(fragment.ownerDocument, owner);
    processor.removeParameter("urn:q", "q");
    assert.equal(processor.getParameter("urn:q", "q"), undefined);
    processor.clearParameters();
    assert.equal(processor.getParameter(null, "p"), undefined);
    processor.reset();
    assert.equal(processor.stylesheet, null);
  });
});
