/**
 * Output edge cases: text output through transformToDocument, the default
 * output method (XSLT 1.0 section 16), error recovery for comments (7.4) and
 * processing instructions (7.3), XML whitespace in stylesheets (3.4) and deep
 * template recursion.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  compile,
  parseXML,
  run,
  stylesheet,
  XSL_OPEN,
} from "./harness.test.js";
import { detectOutputMethod } from "./serializer/settings.js";
import { XHTML_NAMESPACE, wrapTextResult } from "./resultTree.js";

describe("transformToDocument with text output", () => {
  it("wraps the text in an XHTML pre element, like Chrome", () => {
    const engine = compile(
      stylesheet(
        `<xsl:template match="/">a &lt; b<xsl:value-of select="d"/></xsl:template>`,
      ),
    );
    const doc = engine.transformToDocument(parseXML("<d>!</d>"));
    const root = doc.documentElement;
    assert.strictEqual(root.namespaceURI, XHTML_NAMESPACE);
    assert.deepStrictEqual(
      Array.from(root.childNodes, (n) => n.localName),
      ["head", "body"],
    );
    const pre = root.lastChild.firstChild;
    assert.strictEqual(pre.localName, "pre");
    assert.strictEqual(pre.textContent, "a < b!");
  });

  it("builds the wrapper in any document", () => {
    const doc = parseXML("<x/>").implementation.createDocument(
      null,
      null,
      null,
    );
    wrapTextResult(doc, "");
    assert.strictEqual(
      doc.documentElement.lastChild.firstChild.childNodes.length,
      0,
    );
  });
});

describe("default output method", () => {
  it("is xml when non-whitespace text precedes an html root", () => {
    const xsl = `${XSL_OPEN}<xsl:template match="/">x<html/></xsl:template></xsl:stylesheet>`;
    assert.match(run(xsl), /^<\?xml/);
  });

  it("ignores whitespace-only text before the html root", () => {
    const doc = parseXML("<x/>").implementation.createDocument(
      null,
      null,
      null,
    );
    const fragment = doc.createDocumentFragment();
    fragment.append(
      doc.createComment("c"),
      doc.createCDATASection(" "),
      doc.createTextNode(" \n"),
      doc.createElement("html"),
      doc.createTextNode("after"),
    );
    assert.strictEqual(detectOutputMethod(fragment), "html");
    assert.strictEqual(
      detectOutputMethod(fragment.lastChild.previousSibling),
      "html",
    );
    fragment.prepend(doc.createTextNode(" "));
    assert.strictEqual(detectOutputMethod(fragment), "xml");
  });
});

describe("comment and processing instruction recovery", () => {
  it("separates -- and a trailing - in comments", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><o><xsl:comment>a--b---c-</xsl:comment></o></xsl:template>`,
      "xml",
    );
    assert.strictEqual(run(xsl), "<o><!--a- -b- - -c- --></o>");
  });

  it("separates ?> in processing instructions", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><o><xsl:processing-instruction name="p">a?>b</xsl:processing-instruction></o></xsl:template>`,
      "xml",
    );
    assert.strictEqual(run(xsl), "<o><?p a? >b?></o>");
  });

  it("applies the comment recovery in html output too", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><p><xsl:comment>x-</xsl:comment></p></xsl:template>`,
      "html",
    );
    assert.strictEqual(run(xsl), "<p><!--x- --></p>");
  });
});

describe("XML whitespace in stylesheets", () => {
  it("keeps a text node made of a no-break space", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><td>&#160;</td></xsl:template>`,
      "xml",
    );
    assert.strictEqual(run(xsl), "<td> </td>");
  });
});

describe("template recursion", () => {
  const countdown = (n) =>
    stylesheet(
      `<xsl:template match="/"><xsl:call-template name="r"><xsl:with-param name="n" select="${n}"/></xsl:call-template></xsl:template>
       <xsl:template name="r"><xsl:param name="n"/><xsl:if test="$n > 0"><xsl:call-template name="r"><xsl:with-param name="n" select="$n - 1"/></xsl:call-template></xsl:if><xsl:if test="$n = 0">done</xsl:if></xsl:template>`,
    );

  it("supports 1000 levels of a recursive named template", () => {
    assert.strictEqual(run(countdown(1000)), "done");
  });

  it("recognises the stack overflow errors of other engines", () => {
    const engine = compile(
      stylesheet(
        `<xsl:template match="/"><xsl:value-of select="boom()"/></xsl:template>`,
      ),
    );
    const overflow = new Error("too much recursion");
    overflow.name = "InternalError";
    engine.xpathEvaluator.registerFunctions({
      boom: () => {
        throw overflow;
      },
    });
    assert.throws(
      () => engine.transformToString(parseXML("<d/>")),
      /Template recursion too deep/,
    );

    const other = new RangeError("Invalid array length");
    engine.xpathEvaluator.registerFunctions({
      boom: () => {
        throw other;
      },
    });
    assert.throws(
      () => engine.transformToString(parseXML("<d/>")),
      /Invalid array length/,
    );
  });

  it("reports infinite recursion with a clear error", () => {
    const xsl = stylesheet(
      `<xsl:template match="/"><xsl:call-template name="r"/></xsl:template><xsl:template name="r"><xsl:call-template name="r"/></xsl:template>`,
    );
    assert.throws(() => run(xsl), /Template recursion too deep/);
  });
});
