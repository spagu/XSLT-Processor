import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectStylesheet, readIncludes } from "./stylesheet.js";
import { sheetFacts, stylesheetXml } from "../../test/fixtures.js";

const EXSL = 'xmlns:exsl="http://exslt.org/common"';
const MSXSL = 'xmlns:msxsl="urn:schemas-microsoft-com:xslt"';

/** The facts of a 1.0 stylesheet with extra markup, without the file key. */
function facts(extra, version = "1.0") {
  return detectStylesheet(stylesheetXml(version, extra));
}

describe("detectStylesheet", () => {
  it("reads the version and finds nothing in a plain stylesheet", () => {
    const { file: _file, ...expected } = sheetFacts();
    assert.deepEqual(detectStylesheet(stylesheetXml("1.0")), expected);
  });

  it("accepts single quotes and spaces around the equals sign", () => {
    const sheet = "<xsl:stylesheet xmlns:xsl='x' version = '2.0'>";
    assert.equal(detectStylesheet(sheet).version, "2.0");
  });

  it("reports unknown when the root or its version is missing", () => {
    assert.equal(detectStylesheet("<not-xslt/>").version, "unknown");
    assert.equal(detectStylesheet(stylesheetXml("")).version, "unknown");
  });

  it("sets the 0.1.0 flags", () => {
    const extra = [
      '<xsl:key name="k" match="x" use="@id"/>',
      `<xsl:value-of select="document('a.xml')" disable-output-escaping="yes"/>`,
      `<xsl:value-of select="exsl:node-set($x)" ${EXSL}/>`,
      `<xsl:value-of select="msxsl:node-set($y)" ${MSXSL}/>`,
    ].join("\n");
    const found = facts(extra, "3.0");
    assert.equal(found.version, "3.0");
    assert.equal(found.exslt, true);
    assert.equal(found.disableOutputEscaping, true);
    assert.equal(found.documentFunction, true);
    assert.equal(found.key, true);
    assert.equal(found.msxml, true);
    assert.deepEqual(found.exsltModules, ["common"]);
    assert.deepEqual(found.msxmlFunctions, []);
    assert.equal(found.msxmlScript, false);
    assert.equal(facts("urn:schemas-microsoft-com:xslt").msxml, true);
    assert.equal(
      facts('disable-output-escaping="no"').disableOutputEscaping,
      false,
    );
  });

  it("names EXSLT modules and the functions and elements the library lacks", () => {
    const extra = [
      '<x xmlns:date="http://exslt.org/dates-and-times" xmlns:dyn="http://exslt.org/dynamic" xmlns:re="http://exslt.org/regular-expressions/" ' +
        `${EXSL}/>`,
      "<xsl:value-of select=\"date:format-date(date:date(), 'y')\"/>",
      "<xsl:value-of select=\"dyn:map(a, 'b')\"/>",
      '<exsl:document href="out.xml"/>',
    ].join("\n");
    const found = facts(extra);
    assert.deepEqual(found.exsltModules, [
      "common",
      "dates-and-times",
      "dynamic",
      "regular-expressions",
    ]);
    assert.deepEqual(found.unsupportedExslt, [
      "date:format-date",
      "dyn:map",
      "exsl:document",
    ]);
  });

  it("finds msxsl:script and the MSXML functions other than node-set", () => {
    const extra = [
      `<msxsl:script language="JScript" implements-prefix="user" ${MSXSL} xmlns:user="urn:user">x</msxsl:script>`,
      '<xsl:value-of select="user:f()"/>',
      '<xsl:value-of select="msxsl:format-date(.) and msxsl:node-set(.)"/>',
    ].join("\n");
    const found = facts(extra);
    assert.equal(found.msxmlScript, true);
    assert.deepEqual(found.msxmlFunctions, ["msxsl:format-date"]);
    assert.deepEqual(found.extensionFunctions, []);
  });

  it("finds extension functions and extension element namespaces", () => {
    const extra = [
      '<x xmlns:saxon="http://saxon.sf.net/" xmlns:my="urn:my" xmlns:fn="http://www.w3.org/2005/xpath-functions" xmlns:ext="urn:ext"/>',
      '<xsl:value-of select="saxon:evaluate($e) + fn:abs(1) + my:total(2) + nope:x()"/>',
      '<xsl:function name="my:total"><xsl:param name="n"/></xsl:function>',
      '<xsl:template match="/" extension-element-prefixes="ext exsl missing #default">',
      `<x ${EXSL}/>`,
      '<p title="Note: plain(text)">Call foo:bar( in prose is ignored</p>',
      "<undeclared:element/>",
    ].join("\n");
    const found = facts(extra, "2.0");
    assert.deepEqual(found.extensionFunctions, ["saxon:evaluate"]);
    assert.deepEqual(found.extensionNamespaces, [
      "missing: (undeclared)",
      "urn:ext",
    ]);
  });
});

describe("readIncludes", () => {
  it("lists include and import references with their lines", () => {
    const content = [
      "<xsl:stylesheet>",
      '<xsl:import href="base.xsl"/>',
      "<xsl:include",
      '  href="parts/a.xsl"/>',
      "<xsl:include/>",
    ].join("\n");
    assert.deepEqual(readIncludes(content), [
      { kind: "xsl:import", href: "base.xsl", line: 2 },
      { kind: "xsl:include", href: "parts/a.xsl", line: 3 },
    ]);
  });
});
