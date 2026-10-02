import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serialize } from "../../index.js";
import { stylesheet, transform } from "../testing.test.js";

/**
 * Runs a template body and returns the whole result.
 * @param {string} body
 * @param {object} [options]
 * @returns {object}
 */
const result = (body, options = {}) =>
  transform(
    stylesheet(
      `${options.declarations ?? ""}<xsl:template match="/">${body}</xsl:template>`,
    ),
    "<doc/>",
    options,
  );

describe("the default output method", () => {
  const method = (body, options) => result(body, options).output.method;
  const XHTML = 'xmlns="http://www.w3.org/1999/xhtml"';

  it("follows the document element", () => {
    assert.equal(method("<HTML/>"), "html");
    assert.equal(method(` <html ${XHTML}/>`), "xhtml");
    assert.equal(method(`<head ${XHTML}/>`), "xml");
    assert.equal(method("x<html/>"), "xml");
    assert.equal(method("<xsl:comment>c</xsl:comment><html/>"), "html");
    assert.equal(method("<xsl:text> </xsl:text><html/>"), "html");
    assert.equal(method(""), "xml");
    assert.equal(
      result(
        `<xsl:result-document href="r"><html ${XHTML}/></xsl:result-document>`,
      ).secondary.get("r").output.method,
      "xhtml",
    );
  });

  it("is xml for XHTML from a version 1.0 stylesheet", () => {
    const { output } = transform(
      stylesheet(`<xsl:template match="/"><html ${XHTML}/></xsl:template>`, {
        version: "1.0",
      }),
      "<doc/>",
    );
    assert.equal(output.method, "xml");
  });

  it("reads parameters from a parameter document", () => {
    const params =
      '<output:serialization-parameters xmlns:output="http://www.w3.org/2010/xslt-xquery-serialization">' +
      '<output:indent value="yes"/><output:method value="text"/>' +
      '<output:use-character-maps><output:character-map character="x" map-string="y"/></output:use-character-maps>' +
      "</output:serialization-parameters>";
    const { output } = result("<out/>", {
      declarations: '<xsl:output parameter-document="p.xml" method="xml"/>',
      baseUri: "file:///s/main.xsl",
      loadStylesheet: (uri) => (uri === "file:///s/p.xml" ? params : null),
    });
    assert.equal(output.indent, true);
    assert.deepEqual(output["use-character-maps"], new Map([["x", "y"]]));
    assert.equal(output.method, "xml");
  });
});

describe("the default HTML version", () => {
  /**
   * Serializes the principal result of a stylesheet.
   * @param {string} body - Declarations and templates
   * @param {string} version - Version of the stylesheet
   * @returns {string}
   */
  const html = (body, version) => {
    const { principal, output } = transform(
      stylesheet(body, { version }),
      "<doc/>",
    );
    return serialize([principal].flat(), output);
  };
  const page = '<xsl:template match="/"><html><br/></html></xsl:template>';
  const doctype = /^<!DOCTYPE html>/;

  it("is HTML 4.01 for an XSLT 1.0 or 2.0 stylesheet", () => {
    for (const version of ["1.0", "2.0"]) {
      const text = html(`<xsl:output method="html"/>${page}`, version);
      assert.doesNotMatch(text, doctype, version);
      assert.match(text, /<br>/);
      // the method implied by the result
      assert.doesNotMatch(html(page, version), doctype);
    }
  });

  it("is HTML5 for XSLT 3.0, or when the stylesheet asks for it", () => {
    assert.match(html(`<xsl:output method="html"/>${page}`, "3.0"), doctype);
    assert.match(
      html(`<xsl:output method="html" html-version="5"/>${page}`, "1.0"),
      doctype,
    );
    assert.match(
      html(`<xsl:output method="html" version="5.0"/>${page}`, "2.0"),
      doctype,
    );
    assert.match(
      html(
        '<xsl:template match="/"><xsl:result-document method="html" html-version="5">' +
          "<html/></xsl:result-document></xsl:template>",
        "2.0",
      ),
      doctype,
    );
  });
});
