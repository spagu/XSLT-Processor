/**
 * Tests for forwards-compatible processing and xsl:fallback
 * (XSLT 1.0 sections 2.5 and 15).
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { compile, parseXML, run } from "./harness.test.js";
import {
  fallbackChildren,
  isForwardsCompatible,
} from "./forwardsCompatible.js";

const NS = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';

/**
 * A text-output stylesheet of the given version.
 *
 * @param {string} version - The version attribute
 * @param {string} body - Top-level elements
 * @returns {string} The stylesheet
 */
const versioned = (version, body) =>
  `<xsl:stylesheet version="${version}" ${NS}><xsl:output method="text"/>${body}</xsl:stylesheet>`;

/**
 * Call a function, collecting console.warn messages.
 *
 * @param {() => *} action - The code to run
 * @returns {{result: *, warnings: string[]}} Its result and the warnings
 */
function warned(action) {
  const warn = mock.method(console, "warn", () => {});
  try {
    const result = action();
    return { result, warnings: warn.mock.calls.map((c) => c.arguments[0]) };
  } finally {
    warn.mock.restore();
  }
}

describe("isForwardsCompatible", () => {
  it("follows the nearest version declaration", () => {
    const doc = parseXML(
      `<xsl:stylesheet version="2.0" ${NS}><xsl:template><r xsl:version="1.0"><s/></r><t/></xsl:template></xsl:stylesheet>`,
    );
    const template = doc.documentElement.firstChild;
    const [r, t] = template.childNodes;
    assert.strictEqual(isForwardsCompatible(template), true);
    assert.strictEqual(isForwardsCompatible(r.firstChild), false);
    assert.strictEqual(isForwardsCompatible(t), true);
    assert.strictEqual(isForwardsCompatible(t), true);
    assert.strictEqual(isForwardsCompatible(doc), false);
    assert.strictEqual(isForwardsCompatible(null), false);
  });

  it("is off for version 1.0 and without any declaration", () => {
    const doc = parseXML(
      `<xsl:transform version=" 1.0 " ${NS}><xsl:template/></xsl:transform>`,
    );
    assert.strictEqual(
      isForwardsCompatible(doc.documentElement.firstChild),
      false,
    );
    assert.strictEqual(
      isForwardsCompatible(parseXML("<a/>").documentElement),
      false,
    );
  });
});

describe("fallbackChildren", () => {
  it("lists the xsl:fallback children in order", () => {
    const doc = parseXML(
      `<xsl:foo ${NS}><xsl:fallback>1</xsl:fallback><x/><xsl:fallback>2</xsl:fallback></xsl:foo>`,
    );
    const texts = fallbackChildren(doc.documentElement).map(
      (f) => f.textContent,
    );
    assert.deepStrictEqual(texts, ["1", "2"]);
  });
});

describe("unknown XSLT instructions", () => {
  const template = (body) => `<xsl:template match="/">${body}</xsl:template>`;

  it("instantiates every xsl:fallback in forwards-compatible mode", () => {
    const xsl = versioned(
      "2.0",
      template(
        '<xsl:foo select="x"><xsl:fallback>F</xsl:fallback><xsl:fallback>B</xsl:fallback></xsl:foo>',
      ),
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "FB");
    assert.deepStrictEqual(warnings, []);
  });

  it("instantiates xsl:fallback in 1.0 mode too", () => {
    const xsl = versioned(
      "1.0",
      template(
        '<xsl:foo><xsl:fallback><xsl:value-of select="name(*)"/></xsl:fallback></xsl:foo>',
      ),
    );
    assert.strictEqual(run(xsl, "<doc/>"), "doc");
  });

  it("reports an unknown instruction without fallback only when instantiated", () => {
    const xsl = versioned(
      "2.0",
      template('a<xsl:if test="false()"><xsl:bar/></xsl:if><xsl:foo/>b'),
    );
    const { result, warnings } = warned(() => run(xsl));
    assert.strictEqual(result, "ab");
    assert.deepStrictEqual(warnings, ["Unknown XSLT element: foo"]);
  });

  it("does not report xsl:foo as available", () => {
    const xsl = versioned(
      "2.0",
      template(
        "<xsl:value-of select=\"concat(element-available('xsl:foo'), element-available('xsl:fallback'))\"/>",
      ),
    );
    assert.strictEqual(run(xsl), "falsetrue");
  });
});

describe("unknown top-level XSLT elements", () => {
  const body =
    '<xsl:function name="f"/><xsl:template match="/">ok</xsl:template>';

  it("are ignored silently in forwards-compatible mode", () => {
    const { result, warnings } = warned(() => run(versioned("3.0", body)));
    assert.strictEqual(result, "ok");
    assert.deepStrictEqual(warnings, []);
  });

  it("are reported and ignored in 1.0 mode", () => {
    const { result, warnings } = warned(() =>
      compile(versioned("1.0", body)).transformToString(parseXML("<d/>")),
    );
    assert.strictEqual(result, "ok");
    assert.deepStrictEqual(warnings, [
      "XSLT: unknown top-level element xsl:function is ignored",
    ]);
  });
});
