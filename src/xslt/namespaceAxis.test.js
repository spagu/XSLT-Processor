/**
 * Namespace nodes in XSLT: the namespace axis in expressions, xsl:copy and
 * xsl:copy-of of namespace nodes (XSLT 1.0 sections 7.5, 11.3),
 * generate-id() and the built-in template rule (section 5.8).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { run, stylesheet } from "./harness.test.js";

const SOURCE = '<r xmlns:a="urn:a" xmlns="urn:d"><c xmlns:b="urn:b"/></r>';

/**
 * Run a template body matching the root against SOURCE.
 *
 * @param {string} body - Content of the root template
 * @param {string} [method] - Output method
 * @returns {string} The serialized result
 */
const root = (body, method = "text") =>
  run(
    stylesheet(`<xsl:template match="/">${body}</xsl:template>`, method),
    SOURCE,
  );

describe("namespace axis in XSLT", () => {
  it("counts the namespace nodes of an element (B31)", () => {
    assert.strictEqual(
      run(
        stylesheet(
          '<xsl:template match="/"><xsl:value-of select="count(r/namespace::*)"/></xsl:template>',
        ),
        '<r xmlns:a="u"/>',
      ),
      "2",
    );
  });

  it("lists prefixes and URIs of the in-scope namespaces", () => {
    assert.strictEqual(
      root(
        '<xsl:for-each select="*/*/namespace::*"><xsl:value-of select="concat(name(), \'=\', .)"/>;</xsl:for-each>',
      ),
      "xml=http://www.w3.org/XML/1998/namespace;b=urn:b;=urn:d;a=urn:a;",
    );
  });

  it("gives namespace nodes stable generate-id() values", () => {
    assert.strictEqual(
      root(
        '<xsl:value-of select="generate-id(*/namespace::a) = generate-id(*/namespace::a)"/>' +
          '<xsl:value-of select="generate-id(*/namespace::a) = generate-id(*/namespace::xml)"/>',
      ),
      "truefalse",
    );
  });

  it("applies no built-in output to namespace nodes", () => {
    assert.strictEqual(
      root('<xsl:apply-templates select="*/namespace::*"/>'),
      "",
    );
    // Patterns never match namespace nodes, not even node()
    assert.strictEqual(
      run(
        stylesheet(
          '<xsl:template match="/"><xsl:apply-templates select="*/namespace::*"/></xsl:template><xsl:template match="node()">N</xsl:template>',
        ),
        SOURCE,
      ),
      "",
    );
  });

  it("copies a namespace node as a declaration with xsl:copy-of", () => {
    assert.strictEqual(
      root(
        '<o><xsl:copy-of select="*/*/namespace::b | */namespace::xml"/></o>',
        "xml",
      ),
      '<o xmlns:b="urn:b"/>',
    );
  });

  it("copies a namespace node as a declaration with xsl:copy", () => {
    assert.strictEqual(
      root(
        '<o><xsl:for-each select="*/namespace::*"><xsl:copy/></xsl:for-each></o>',
        "xml",
      ),
      // xmlns="urn:d" would move the unprefixed o into urn:d: not declared
      '<o xmlns:a="urn:a"/>',
    );
  });

  it("does not rebind the prefix of the element name", () => {
    assert.strictEqual(
      root(
        '<p:o xmlns:p="urn:p"><xsl:copy-of select="*/namespace::*"/><xsl:attribute name="x">1</xsl:attribute></p:o>',
        "xml",
      ),
      '<p:o xmlns:p="urn:p" xmlns:a="urn:a" xmlns="urn:d" x="1"/>',
    );
    assert.strictEqual(
      run(
        stylesheet(
          '<xsl:template match="/"><o xmlns:p="urn:other"><xsl:copy-of select="*/namespace::p"/></o></xsl:template>',
          "xml",
        ),
        '<r xmlns:p="urn:p"/>',
      ),
      '<o xmlns:p="urn:other"/>',
    );
    assert.strictEqual(
      root(
        '<p:o xmlns:p="urn:p"><xsl:copy-of select="*/namespace::*[name()=\'\']"/></p:o>',
        "xml",
      ),
      '<p:o xmlns:p="urn:p" xmlns="urn:d"/>',
    );
  });

  it("ignores a namespace node copied after children", () => {
    assert.strictEqual(
      root('<o>t<xsl:copy-of select="*/namespace::a"/></o>', "xml"),
      "<o>t</o>",
    );
    assert.strictEqual(root('<xsl:copy-of select="*/namespace::a"/>'), "");
  });
});
