/**
 * Behaviour aligned with libxslt (Chrome) in 1.2.0: extension elements and
 * xsl:fallback (XSLT 1.0 sections 14.1, 15), literal-only id()/key()
 * patterns (5.2) and cdata-section-elements with the default namespace
 * (16.1; libxslt resolves unprefixed names with xsltGetQNameURI).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { compile, run, stylesheet } from "./harness.test.js";

const EXT = 'xmlns:ext="urn:ext" extension-element-prefixes="ext"';

/**
 * Capture console.warn while running a function.
 *
 * @param {() => *} fn - Code to run
 * @returns {{result: *, warnings: string[]}} Its result and the warnings
 */
function warned(fn) {
  const warnings = [];
  const warn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    return { result: fn(), warnings };
  } finally {
    console.warn = warn;
  }
}

describe("extension elements", () => {
  it("instantiates xsl:fallback instead of copying the element", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><o><ext:do>ignored<xsl:fallback>fb</xsl:fallback><xsl:fallback>2</xsl:fallback></ext:do></o></xsl:template>',
      "xml",
      EXT,
    );
    assert.strictEqual(run(xsl), "<o>fb2</o>");
  });

  it("reports an extension element without xsl:fallback and produces nothing", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><o><ext:do>x</ext:do><ext:do/></o></xsl:template>',
      "xml",
      EXT,
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "<o/>");
    assert.deepStrictEqual(warnings, [
      "XSLT: extension element ext:do ({urn:ext}do) is not supported and has no xsl:fallback",
    ]);
  });

  it("honours xsl:extension-element-prefixes on literal result elements", () => {
    const xsl = stylesheet(
      '<xsl:template match="/"><o xmlns:e="urn:e" xsl:extension-element-prefixes="e"><e:x><xsl:fallback>f</xsl:fallback></e:x></o><e:x xmlns:e="urn:e"/></xsl:template>',
      "xml",
    );
    assert.strictEqual(run(xsl), '<o>f</o><e:x xmlns:e="urn:e"/>');
  });

  it("calls a registered extension element", () => {
    const engine = compile(
      stylesheet(
        '<xsl:template match="/"><o><ext:hello name="w"><xsl:fallback>no</xsl:fallback></ext:hello></o></xsl:template>',
        "xml",
        EXT,
      ),
    );
    assert.strictEqual(
      engine.registerExtensionElement(
        "urn:ext",
        "hello",
        (node, context, output) => {
          output.appendChild(
            context.outputDocument.createTextNode(
              `hi ${node.getAttribute("name")}`,
            ),
          );
        },
      ),
      engine,
    );
    assert.strictEqual(
      engine.transformToString(engine.stylesheetDoc),
      "<o>hi w</o>",
    );
  });
});

describe("id() and key() patterns", () => {
  it("rejects a variable argument when the stylesheet is imported", () => {
    const xsl = stylesheet(
      '<xsl:key name="k" match="e" use="."/><xsl:variable name="v" select="1"/><xsl:template match="key(\'k\', $v)">x</xsl:template>',
    );
    assert.throws(() => compile(xsl), /key\(\) expects 2 literals/);
  });
});

describe("cdata-section-elements", () => {
  it("uses the default namespace for unprefixed names, as libxslt (bug-140)", () => {
    const xsl = stylesheet(
      '<xsl:output cdata-section-elements="c"/><xsl:template match="/"><r><c>1</c><c xmlns="">2</c></r></xsl:template>',
      "xml",
      'xmlns="urn:d"',
    );
    assert.strictEqual(
      run(xsl),
      '<r xmlns="urn:d"><c><![CDATA[1]]></c><c xmlns="">2</c></r>',
    );
  });
});
