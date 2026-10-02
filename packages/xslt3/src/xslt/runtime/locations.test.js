import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { XPathError } from "../../errors.js";
import { untypedAtomic } from "../index.js";
import {
  errorCode,
  parse,
  runBody,
  stylesheet,
  transform,
} from "../testing.test.js";
import { locate, locateInFrames, locationOf } from "./locations.js";

/** The error a function raises. */
function caught(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return assert.fail("no error raised");
}

const xsl = (body) =>
  stylesheet(
    `<xsl:template match="/">\n<out>\n${body}\n</out>\n</xsl:template>`,
  );

describe("error locations", () => {
  it("give the line of the instruction that failed at run time", () => {
    const error = caught(() =>
      transform(xsl('<xsl:value-of select="1 div 0"/>'), "<doc/>", {
        baseUri: "file:///s/main.xsl",
      }),
    );
    assert.equal(error.code, "FOAR0001");
    assert.deepEqual(error.location, {
      module: "file:///s/main.xsl",
      line: 3,
      column: 1,
    });
    assert.match(error.message, /\(line 3 of file:\/\/\/s\/main\.xsl\)$/);
  });

  it("give the line of the instruction that failed to compile", () => {
    const error = caught(() => transform(xsl('<xsl:value-of select="1 +"/>')));
    assert.equal(error.code, "XPST0003");
    assert.equal(error.location.line, 3);
    assert.match(error.message, /\(line 3\)$/);
  });

  it("leave err:description without the location", () => {
    assert.equal(
      runBody(
        "<xsl:try><xsl:sequence select=\"error(xs:QName('e'), 'plain')\"/><xsl:catch>{$err:description}</xsl:catch></xsl:try>",
        "<doc/>",
        { attributes: 'expand-text="yes"' },
      ),
      "plain",
    );
  });

  it("are left out when unknown", () => {
    const plain = new Error("not an XPath error");
    assert.equal(locate(plain, { nodeType: 1 }), plain);
    const error = new XPathError("XTDE0000", "x");
    assert.equal(locate(error, undefined).location, undefined);
    assert.deepEqual(locationOf({ nodeType: 3, parentNode: null }), {});
    assert.equal(
      locateInFrames(error, [{ body: [() => {}], index: 1 }], 0),
      error,
    );
    assert.equal(error.location, undefined);
    assert.equal(locateInFrames(plain, [], 0), plain);
  });
});

describe("stylesheet parameters", () => {
  const params = stylesheet(
    '<xsl:param name="n" as="xs:integer"/><xsl:param name="m" as="xs:integer*" select="()"/><xsl:template match="/"><out><xsl:value-of select="$n + 1, sum($m)"/></out></xsl:template>',
  );

  it("can be untyped atomic values", () => {
    assert.equal(
      transform(params, "<doc/>", {
        params: { n: "5", m: ["1", "2"] },
        paramsAsUntyped: true,
      }).principal.documentElement.textContent,
      "6 3",
    );
    assert.equal(
      transform(params, "<doc/>", { params: { n: untypedAtomic(41) } })
        .principal.documentElement.textContent,
      "42 0",
    );
  });

  it("are named in messages without Clark notation", () => {
    const error = caught(() =>
      transform(params, "<doc/>", { params: { n: "5" } }),
    );
    assert.equal(error.code, "XTTE0590");
    assert.match(error.message, /parameter \$n /);
    assert.equal(
      errorCode(() =>
        transform(
          stylesheet(
            '<xsl:param name="q:p" xmlns:q="urn:q" required="yes"/><xsl:template match="/"/>',
          ),
        ),
      ),
      "XTDE0050",
    );
    assert.match(
      caught(() =>
        transform(
          stylesheet(
            '<xsl:param name="q:p" xmlns:q="urn:q" required="yes"/><xsl:template match="/"/>',
          ),
        ),
      ).message,
      /\$Q\{urn:q\}p/,
    );
  });
});

describe("loaders", () => {
  it("get the base URI of the reference", () => {
    const seen = [];
    const module = parse(
      stylesheet('<xsl:template name="t"><t/></xsl:template>'),
    );
    transform(
      stylesheet(
        `<xsl:include href="inc.xsl"/><xsl:template match="/"><out>{name(doc('d.xml')/*)}</out></xsl:template>`,
        { attributes: 'expand-text="yes"' },
      ),
      "<doc/>",
      {
        baseUri: "file:///s/main.xsl",
        loadStylesheet: (uri, base) => (seen.push([uri, base]), module),
        documentLoader: (uri, base) => (seen.push([uri, base]), parse("<d/>")),
      },
    );
    assert.deepEqual(seen, [
      ["file:///s/inc.xsl", "file:///s/main.xsl"],
      ["file:///s/d.xml", "file:///s/main.xsl"],
    ]);
  });
});
