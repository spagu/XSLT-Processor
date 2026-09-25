/**
 * End-to-end conformance tests for template rules: pattern matching (XSLT 1.0
 * section 5.2), conflict resolution (5.5), imports (2.6.2), named templates,
 * keys (12.2), default output method (16) and simplified stylesheets (2.3).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XsltEngine } from "./engine.js";

const XSL_OPEN =
  '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">';

let dom;

/**
 * Parse an XML string with the jsdom parser.
 *
 * @param {string} xml - Markup to parse
 * @returns {Document} The parsed document
 */
function parseXML(xml) {
  return new dom.window.DOMParser().parseFromString(xml, "application/xml");
}

/**
 * Compile a stylesheet and transform a document to a string.
 *
 * @param {string} xsl - Complete stylesheet, or top-level content only
 * @param {string|Document} xml - Source document
 * @param {object} [options] - Engine options
 * @param {Object<string, string>} [options.imports] - Stylesheets by URI
 * @returns {string} The serialized result
 */
function run(xsl, xml, { imports } = {}) {
  const engine = new XsltEngine();
  if (imports) engine.setStylesheetLoader((uri) => imports[uri]);
  const source = xsl.includes("xsl:version=")
    ? xsl
    : xsl.includes("<xsl:stylesheet")
      ? xsl
      : `${XSL_OPEN}<xsl:output method="text"/>${xsl}</xsl:stylesheet>`;
  engine.importStylesheet(parseXML(source), imports ? "http://x/main.xsl" : "");
  return engine.transformToString(
    typeof xml === "string" ? parseXML(xml) : xml,
  );
}

beforeEach(() => {
  dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
});

describe("root pattern '/'", () => {
  it("matches only the document node, never the document element", () => {
    const out = run(
      `${XSL_OPEN}<xsl:output method="xml" omit-xml-declaration="yes"/>
        <xsl:template match="/"><html><xsl:apply-templates/></html></xsl:template>
        <xsl:template match="catalog"><ul/></xsl:template></xsl:stylesheet>`,
      "<catalog/>",
    );
    assert.strictEqual(out, "<html><ul/></html>");
  });

  it("renders the classic w3schools catalog stylesheet", () => {
    const xml = `<?xml version="1.0"?><catalog>
      <cd><title>Hide your heart</title><artist>Bonnie Tyler</artist></cd>
      <cd><title>Empire Burlesque</title><artist>Bob Dylan</artist></cd>
      <cd><title>Greatest Hits</title><artist>Dolly Parton</artist></cd>
    </catalog>`;
    const xsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:template match="/">
  <html>
  <body>
    <h2>My CD Collection</h2>
    <xsl:apply-templates/>
  </body>
  </html>
</xsl:template>
<xsl:template match="catalog">
  <table border="1">
    <tr><th>Title</th><th>Artist</th></tr>
    <xsl:for-each select="cd">
      <xsl:sort select="artist"/>
      <tr><td><xsl:value-of select="title"/></td><td><xsl:value-of select="artist"/></td></tr>
    </xsl:for-each>
  </table>
</xsl:template>
</xsl:stylesheet>`;
    const out = run(xsl, xml);
    assert.strictEqual(
      out,
      '<html><body><h2>My CD Collection</h2><table border="1">' +
        "<tr><th>Title</th><th>Artist</th></tr>" +
        "<tr><td>Empire Burlesque</td><td>Bob Dylan</td></tr>" +
        "<tr><td>Hide your heart</td><td>Bonnie Tyler</td></tr>" +
        "<tr><td>Greatest Hits</td><td>Dolly Parton</td></tr>" +
        "</table></body></html>",
    );
    assert.strictEqual(out.match(/<html>/g).length, 1);
  });
});

describe("multi-step patterns", () => {
  const cases = [
    ["c/d", "<r><c><d/></c><e><d/></e></r>", "[D]-"],
    ["*/d", "<r><c><d/></c><e><d/></e></r>", "[D][D]"],
    ["r//d", "<r><c><d/></c><e><d/></e></r>", "[D][D]"],
    ["/r/c/d", "<r><c><d/></c><e><d/></e></r>", "[D]-"],
    ["//e/d", "<r><c><d/></c><e><d/></e></r>", "-[D]"],
    ["c/d[2]", "<r><c><d/><d/></c><e><d/></e></r>", "-[D]-"],
    ["d[last()]", "<r><c><d/><x/><d/></c><e><d/></e></r>", "-[D][D]"],
    ["d[@k][2]", '<r><c><d/><d k="1"/><d k="2"/></c></r>', "--[D]"],
    ["id('x')/d", '<r><c id="x"><d/></c><e id="y"><d/></e></r>', "[D]-"],
    ["key('k','v')//d", '<r><c t="v"><d/></c><e><d/></e></r>', "[D]-"],
    ["c/d | e/d", "<r><c><d/></c><e><d/></e><f><d/></f></r>", "[D][D]-"],
  ];

  for (const [pattern, xml, expected] of cases) {
    it(`matches ${pattern}`, () => {
      const out = run(
        `${XSL_OPEN}<xsl:output method="text"/>
        <xsl:key name="k" match="*" use="@t"/>
        <xsl:template match="/"><xsl:apply-templates select="//d"/></xsl:template>
        <xsl:template match="d">-</xsl:template>
        <xsl:template match="${pattern}" priority="1">[D]</xsl:template>
        </xsl:stylesheet>`,
        xml,
      );
      assert.strictEqual(out, expected);
    });
  }

  it("matches attribute steps with a parent step", () => {
    const out = run(
      `<xsl:template match="/"><xsl:apply-templates select="//@a"/></xsl:template>
       <xsl:template match="e/@a">E</xsl:template>
       <xsl:template match="@a">X</xsl:template>`,
      '<r><e a="1"/><f a="2"/></r>',
    );
    assert.strictEqual(out, "EX");
  });

  it("matches node type tests and namespaced names", () => {
    const out = run(
      `${XSL_OPEN.replace(">", ' xmlns:p="urn:p">')}<xsl:output method="text"/>
       <xsl:template match="/"><xsl:apply-templates select="//node()"/></xsl:template>
       <xsl:template match="node()">[N]</xsl:template>
       <xsl:template match="p:item">[P]</xsl:template>
       <xsl:template match="p:*">[*]</xsl:template>
       <xsl:template match="text()">[T]</xsl:template>
       <xsl:template match="comment()">[C]</xsl:template>
       <xsl:template match="processing-instruction('x')">[X]</xsl:template>
       <xsl:template match="processing-instruction()">[PI]</xsl:template></xsl:stylesheet>`,
      '<r xmlns:q="urn:p"><q:item/><q:other/><plain/>t<!--c--><?x a?><?y b?></r>',
    );
    assert.strictEqual(out, "[N][P][*][N][T][C][X][PI]");
  });
});

describe("conflict resolution", () => {
  it("chooses the last template on equal priority and precedence", () => {
    const out = run(
      `<xsl:template match="d">A</xsl:template><xsl:template match="d">B</xsl:template>`,
      "<d/>",
    );
    assert.strictEqual(out, "B");
  });

  it("still prefers the higher priority over document order", () => {
    const out = run(
      `<xsl:template match="r/d">A</xsl:template><xsl:template match="d">B</xsl:template>`,
      "<r><d/></r>",
    );
    assert.strictEqual(out, "A");
  });
});

describe("imports", () => {
  const lib = (body) => `${XSL_OPEN}${body}</xsl:stylesheet>`;

  it("allows the same stylesheet through two import branches", () => {
    const imports = {
      "http://x/a.xsl": lib('<xsl:import href="c.xsl"/>'),
      "http://x/b.xsl": lib('<xsl:import href="c.xsl"/>'),
      "http://x/c.xsl": lib('<xsl:template name="n">C</xsl:template>'),
    };
    const out = run(
      `${XSL_OPEN}<xsl:import href="a.xsl"/><xsl:import href="b.xsl"/>
       <xsl:output method="text"/>
       <xsl:template match="/"><xsl:call-template name="n"/></xsl:template></xsl:stylesheet>`,
      "<d/>",
      { imports },
    );
    assert.strictEqual(out, "C");
  });

  it("still rejects a stylesheet importing itself indirectly", () => {
    const imports = {
      "http://x/a.xsl": lib('<xsl:import href="b.xsl"/>'),
      "http://x/b.xsl": lib('<xsl:import href="a.xsl"/>'),
    };
    assert.throws(
      () =>
        run(`${XSL_OPEN}<xsl:import href="a.xsl"/></xsl:stylesheet>`, "<d/>", {
          imports,
        }),
      /Circular stylesheet reference detected: http:\/\/x\/a.xsl/,
    );
  });

  it("rejects a stylesheet including the main stylesheet", () => {
    const imports = {
      "http://x/a.xsl": lib('<xsl:include href="main.xsl"/>'),
    };
    assert.throws(
      () =>
        run(`${XSL_OPEN}<xsl:include href="a.xsl"/></xsl:stylesheet>`, "<d/>", {
          imports,
        }),
      /Circular stylesheet reference detected: http:\/\/x\/main.xsl/,
    );
  });

  it("calls the named template with the highest import precedence", () => {
    const imports = {
      "http://x/lib.xsl": lib('<xsl:template name="t">LIB</xsl:template>'),
    };
    const out = run(
      `${XSL_OPEN}<xsl:import href="lib.xsl"/><xsl:output method="text"/>
       <xsl:template name="t">MAIN</xsl:template>
       <xsl:template match="/"><xsl:call-template name="t"/></xsl:template></xsl:stylesheet>`,
      "<d/>",
      { imports },
    );
    assert.strictEqual(out, "MAIN");
  });
});

describe("keys", () => {
  it("merges xsl:key declarations sharing a name", () => {
    const out = run(
      `<xsl:key name="k" match="a" use="@v"/><xsl:key name="k" match="b" use="@w"/>
       <xsl:template match="/"><xsl:for-each select="key('k','1')">
       <xsl:value-of select="name()"/></xsl:for-each></xsl:template>`,
      '<r><a v="1"/><b w="1"/><b v="1"/></r>',
    );
    assert.strictEqual(out, "ab");
  });

  it("returns node-set lookups in document order without duplicates", () => {
    const out = run(
      `<xsl:key name="k" match="i" use="@t"/>
       <xsl:template match="/"><xsl:for-each select="key('k', //q/@t)">
       <xsl:value-of select="."/></xsl:for-each></xsl:template>`,
      '<r><i t="b">1</i><i t="a">2</i><i t="b">3</i><q t="b"/><q t="a"/><q t="b"/></r>',
    );
    assert.strictEqual(out, "123");
  });

  it("rebuilds indexes for every transformation", () => {
    const engine = new XsltEngine();
    engine.importStylesheet(
      parseXML(`${XSL_OPEN}<xsl:output method="text"/>
        <xsl:key name="k" match="i" use="@t"/>
        <xsl:template match="/"><xsl:value-of select="count(key('k','a'))"/></xsl:template>
        </xsl:stylesheet>`),
    );
    const doc = parseXML('<r><i t="a"/></r>');
    assert.strictEqual(engine.transformToString(doc), "1");
    const extra = doc.createElement("i");
    extra.setAttribute("t", "a");
    doc.documentElement.appendChild(extra);
    assert.strictEqual(engine.transformToString(doc), "2");
  });
});

describe("default output method", () => {
  it("uses html when the result root is an html element", () => {
    const out = run(
      `${XSL_OPEN}<xsl:template match="/"><html><br/></html></xsl:template></xsl:stylesheet>`,
      "<d/>",
    );
    assert.strictEqual(out, "<html><br></html>");
  });

  it("uses xml for any other result root", () => {
    const out = run(
      `${XSL_OPEN}<xsl:template match="/"><doc><br/></doc></xsl:template></xsl:stylesheet>`,
      "<d/>",
    );
    assert.strictEqual(
      out,
      '<?xml version="1.0" encoding="UTF-8"?>\n<doc><br/></doc>',
    );
  });

  it("keeps an explicit method authoritative", () => {
    const out = run(
      `${XSL_OPEN}<xsl:output method="xml" omit-xml-declaration="yes"/>
       <xsl:template match="/"><html><br/></html></xsl:template></xsl:stylesheet>`,
      "<d/>",
    );
    assert.strictEqual(out, "<html><br/></html>");
  });
});

describe("simplified stylesheets", () => {
  it("outputs the literal result root element", () => {
    const out = run(
      '<html xsl:version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><p><xsl:value-of select="d"/></p></html>',
      "<d>x</d>",
    );
    assert.strictEqual(out, "<html><p>x</p></html>");
  });
});

describe("pattern matching performance", () => {
  it("applies templates over 20,000 children with a predicate pattern", () => {
    const count = 20000;
    let xml = "<r>";
    for (let i = 0; i < count; i++) xml += `<item id="i${i}"/>`;
    xml += "</r>";
    const out = run(
      `<xsl:template match="/r"><xsl:apply-templates/></xsl:template>
       <xsl:template match="item[@id]">x</xsl:template>
       <xsl:template match="item[last()]">L</xsl:template>`,
      xml,
    );
    assert.strictEqual(out.length, count);
    assert.ok(out.endsWith("xL"));
  });
});
