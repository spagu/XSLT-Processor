/**
 * XSLT-defined XPath function tests.
 *
 * These cover the functions XSLT 1.0 adds to the XPath library: document(),
 * key(), format-number(), current(), generate-id(), system-property(),
 * function-available(), element-available() and unparsed-entity-uri().
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XsltEngine } from "./engine.js";
import { VENDOR, VENDOR_URL, createXsltFunctions } from "./functions.js";
import { XSLT_NAMESPACE } from "./elements.js";
import { XPathContext } from "../xpath/evaluator.js";
import { parse as parseXPath } from "../xpath/parser.js";

let dom;
let serializer;

function setupDOM() {
  dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    contentType: "text/html",
  });

  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.XMLSerializer = dom.window.XMLSerializer;
  serializer = new dom.window.XMLSerializer();
}

function parseXML(xmlString) {
  return new dom.window.DOMParser().parseFromString(
    xmlString,
    "application/xml",
  );
}

/**
 * Wrap template bodies in a stylesheet.
 *
 * @param {string} body - Stylesheet top level content
 * @param {string} [extraAttributes] - Extra attributes for the root element
 * @returns {Document} The parsed stylesheet
 */
function stylesheet(body, extraAttributes = "") {
  return parseXML(
    `<?xml version="1.0"?><xsl:stylesheet version="1.0" xmlns:xsl="${XSLT_NAMESPACE}" ${extraAttributes}>${body}</xsl:stylesheet>`,
  );
}

/**
 * Run a transformation and serialize the result.
 *
 * @param {Document} xslDoc - The stylesheet
 * @param {Document} xmlDoc - The source document
 * @param {(engine: XsltEngine) => void} [configure] - Engine configuration hook
 * @returns {string} The serialized result
 */
function transform(xslDoc, xmlDoc, configure) {
  const engine = new XsltEngine();
  if (configure) configure(engine);
  engine.importStylesheet(xslDoc);

  const fragment = engine.transform(xmlDoc, dom.window.document);
  let output = "";
  for (const node of fragment.childNodes) {
    output += serializer.serializeToString(node);
  }
  return output;
}

/**
 * Evaluate one expression in a template and return the produced text.
 *
 * @param {string} expression - The XPath expression
 * @param {string} [xml] - The source document
 * @param {(engine: XsltEngine) => void} [configure] - Engine configuration hook
 * @returns {string} The text produced by `xsl:value-of`
 */
function evaluateInTemplate(expression, xml = "<root/>", configure) {
  const xslDoc = stylesheet(
    `<xsl:template match="/"><out><xsl:value-of select="${expression}"/></out></xsl:template>`,
  );
  const result = transform(xslDoc, parseXML(xml), configure);
  return result.replace(/^<out\/?>?/, "").replace(/<\/out>$/, "");
}

describe("document()", () => {
  beforeEach(setupDOM);

  const documents = {
    "data.xml": "<data><name>from-loader</name></data>",
    "other.xml": "<data><name>second</name></data>",
  };

  it("should load a document returned as an XML string", () => {
    const text = evaluateInTemplate(
      "document('data.xml')/data/name",
      "<root/>",
      (engine) => engine.setDocumentLoader((uri) => documents[uri] || null),
    );

    assert.strictEqual(text, "from-loader");
  });

  it("should load a document returned as a Document", () => {
    const text = evaluateInTemplate(
      "document('data.xml')/data/name",
      "<root/>",
      (engine) => engine.setDocumentLoader((uri) => parseXML(documents[uri])),
    );

    assert.strictEqual(text, "from-loader");
  });

  it("should ignore fragment identifiers", () => {
    const text = evaluateInTemplate(
      "document('data.xml#name')/data/name",
      "<root/>",
      (engine) => engine.setDocumentLoader((uri) => documents[uri] || null),
    );

    assert.strictEqual(text, "from-loader");
  });

  it("should return the stylesheet for an empty URI", () => {
    const text = evaluateInTemplate("count(document('')/*/*)");

    assert.strictEqual(text, "1");
  });

  it("should return an empty node-set without a loader", () => {
    assert.strictEqual(evaluateInTemplate("count(document('data.xml'))"), "0");
  });

  it("should return an empty node-set when the loader returns null", () => {
    const text = evaluateInTemplate(
      "count(document('missing.xml'))",
      "<root/>",
      (engine) => engine.setDocumentLoader(() => null),
    );

    assert.strictEqual(text, "0");
  });

  it("should union the documents named by a node-set", () => {
    const text = evaluateInTemplate(
      "count(document(/root/uri))",
      "<root><uri>data.xml</uri><uri>other.xml</uri></root>",
      (engine) => engine.setDocumentLoader((uri) => documents[uri] || null),
    );

    assert.strictEqual(text, "2");
  });

  it("should load each URI only once", () => {
    const loaded = [];
    const text = evaluateInTemplate(
      "count(document('data.xml')|document('data.xml'))",
      "<root/>",
      (engine) =>
        engine.setDocumentLoader((uri) => {
          loaded.push(uri);
          return documents[uri];
        }),
    );

    assert.strictEqual(text, "1");
    assert.deepStrictEqual(loaded, ["data.xml"]);
  });

  it("should resolve relative URIs against the stylesheet base URI", () => {
    const requested = [];
    const engine = new XsltEngine();
    engine.setDocumentLoader((uri) => {
      requested.push(uri);
      return "<data><name>ok</name></data>";
    });
    engine.importStylesheet(
      stylesheet(
        `<xsl:template match="/"><out><xsl:value-of select="document('data.xml')/data/name"/></out></xsl:template>`,
      ),
      "/styles/main.xsl",
    );
    engine.transform(parseXML("<root/>"), dom.window.document);

    assert.deepStrictEqual(requested, ["/styles/data.xml"]);
  });

  it("should use an explicit base URI argument", () => {
    const requested = [];
    const text = evaluateInTemplate(
      "document('data.xml', '/elsewhere/main.xsl')/data/name",
      "<root/>",
      (engine) =>
        engine.setDocumentLoader((uri) => {
          requested.push(uri);
          return documents["data.xml"];
        }),
    );

    assert.strictEqual(text, "from-loader");
    assert.deepStrictEqual(requested, ["/elsewhere/data.xml"]);
  });

  it("should fall back to the engine base URI for an empty base argument", () => {
    const requested = [];
    evaluateInTemplate(
      "count(document('data.xml', /root/missing))",
      "<root/>",
      (engine) =>
        engine.setDocumentLoader((uri) => {
          requested.push(uri);
          return null;
        }),
    );

    assert.deepStrictEqual(requested, ["data.xml"]);
  });

  it("should support chaining and clearing the loader", () => {
    const engine = new XsltEngine();
    assert.strictEqual(
      engine.setDocumentLoader(() => null),
      engine,
    );

    engine.importStylesheet(
      stylesheet(
        `<xsl:template match="/"><out><xsl:value-of select="count(document('data.xml'))"/></out></xsl:template>`,
      ),
    );
    engine.setDocumentLoader(null);

    const fragment = engine.transform(parseXML("<root/>"), dom.window.document);
    assert.strictEqual(fragment.firstChild.textContent, "0");
  });
});

describe("key()", () => {
  beforeEach(setupDOM);

  const xml = `<root>
      <item type="a" id="i1">First</item>
      <item type="b" id="i2">Second</item>
      <item type="a" id="i3">Third</item>
    </root>`;

  it("should find every node with a matching key value", () => {
    const xslDoc = stylesheet(
      `<xsl:key name="itemsByType" match="item" use="@type"/>
       <xsl:template match="/"><out><xsl:for-each select="key('itemsByType','a')"><xsl:value-of select="@id"/>,</xsl:for-each></out></xsl:template>`,
    );

    assert.strictEqual(transform(xslDoc, parseXML(xml)), "<out>i1,i3,</out>");
  });

  it("should accept a node-set as the key value", () => {
    const xslDoc = stylesheet(
      `<xsl:key name="itemsByType" match="item" use="@type"/>
       <xsl:template match="/"><out><xsl:value-of select="count(key('itemsByType',/root/item/@type))"/></out></xsl:template>`,
    );

    assert.strictEqual(transform(xslDoc, parseXML(xml)), "<out>3</out>");
  });

  it("should return an empty node-set for an unused value", () => {
    const xslDoc = stylesheet(
      `<xsl:key name="itemsByType" match="item" use="@type"/>
       <xsl:template match="/"><out><xsl:value-of select="count(key('itemsByType','zzz'))"/></out></xsl:template>`,
    );

    assert.strictEqual(transform(xslDoc, parseXML(xml)), "<out>0</out>");
  });

  it("should support keys whose use expression is an element", () => {
    const xslDoc = stylesheet(
      `<xsl:key name="byName" match="item" use="name"/>
       <xsl:template match="/"><out><xsl:value-of select="key('byName','x')/@id"/></out></xsl:template>`,
    );

    assert.strictEqual(
      transform(
        xslDoc,
        parseXML('<root><item id="i9"><name>x</name></item></root>'),
      ),
      "<out>i9</out>",
    );
  });

  it("should accept a string valued use expression", () => {
    const xslDoc = stylesheet(
      `<xsl:key name="byType" match="item" use="concat('t-',@type)"/>
       <xsl:template match="/"><out><xsl:value-of select="count(key('byType','t-a'))"/></out></xsl:template>`,
    );

    assert.strictEqual(transform(xslDoc, parseXML(xml)), "<out>2</out>");
  });

  it("should fail the transformation for an undeclared key", () => {
    const xslDoc = stylesheet(
      `<xsl:template match="/"><out><xsl:value-of select="key('nope','a')"/></out></xsl:template>`,
    );

    assert.throws(() => transform(xslDoc, parseXML(xml)), /Undefined key/);
  });
});

describe("format-number()", () => {
  beforeEach(setupDOM);

  it("should format with the default decimal format", () => {
    assert.strictEqual(
      evaluateInTemplate("format-number(1234.5,'#,##0.00')"),
      "1,234.50",
    );
  });

  it("should format a string argument", () => {
    assert.strictEqual(
      evaluateInTemplate("format-number('1234.5','#,##0.00')"),
      "1,234.50",
    );
  });

  it("should use a named decimal format", () => {
    const xslDoc = stylesheet(
      `<xsl:decimal-format name="euro" decimal-separator="," grouping-separator="."/>
       <xsl:template match="/"><out><xsl:value-of select="format-number(1234.5,'#.##0,00','euro')"/></out></xsl:template>`,
    );

    assert.strictEqual(
      transform(xslDoc, parseXML("<root/>")),
      "<out>1.234,50</out>",
    );
  });

  it("should fall back to the default format for an unknown name", () => {
    assert.strictEqual(
      evaluateInTemplate("format-number(1.5,'0.0','nope')"),
      "1.5",
    );
  });

  it("should use the unnamed xsl:decimal-format declaration", () => {
    const xslDoc = stylesheet(
      `<xsl:decimal-format NaN="not a number"/>
       <xsl:template match="/"><out><xsl:value-of select="format-number('x','0.0')"/></out></xsl:template>`,
    );

    assert.strictEqual(
      transform(xslDoc, parseXML("<root/>")),
      "<out>not a number</out>",
    );
  });
});

describe("current()", () => {
  beforeEach(setupDOM);

  it("should return the XSLT current node, not the predicate context node", () => {
    const xslDoc = stylesheet(
      `<xsl:template match="/"><out><xsl:for-each select="/root/item"><xsl:value-of select="count(/root/item[@id=current()/@id])"/></xsl:for-each></out></xsl:template>`,
    );

    assert.strictEqual(
      transform(xslDoc, parseXML('<root><item id="a"/><item id="b"/></root>')),
      "<out>11</out>",
    );
  });

  it("should fall back to the context node outside XSLT", () => {
    const engine = new XsltEngine();
    const doc = parseXML("<root/>");
    const context = new XPathContext(doc.documentElement);

    const nodes = engine.xpathEvaluator.evaluate(
      parseXPath("current()"),
      context,
    );

    assert.deepStrictEqual(nodes, [doc.documentElement]);
  });
});

describe("generate-id()", () => {
  beforeEach(setupDOM);

  it("should be stable per node and start with a letter", () => {
    const xslDoc = stylesheet(
      `<xsl:template match="/"><out><xsl:value-of select="generate-id(/root)"/>|<xsl:value-of select="generate-id(/root)"/>|<xsl:value-of select="generate-id(/root/item)"/></out></xsl:template>`,
    );

    const result = transform(xslDoc, parseXML("<root><item/></root>"));
    const [first, second, third] = result.replace(/<\/?out>/g, "").split("|");

    assert.strictEqual(first, second);
    assert.notStrictEqual(first, third);
    assert.match(first, /^[A-Za-z][A-Za-z0-9]*$/);
  });

  it("should use the context node without arguments", () => {
    const xslDoc = stylesheet(
      `<xsl:template match="/"><out><xsl:for-each select="/root"><xsl:value-of select="generate-id()"/>|<xsl:value-of select="generate-id(.)"/></xsl:for-each></out></xsl:template>`,
    );

    const [first, second] = transform(xslDoc, parseXML("<root/>"))
      .replace(/<\/?out>/g, "")
      .split("|");

    assert.strictEqual(first, second);
  });

  it("should return an empty string for an empty node-set", () => {
    assert.strictEqual(evaluateInTemplate("generate-id(/nothing)"), "");
  });
});

describe("system-property()", () => {
  beforeEach(setupDOM);

  it("should report the XSLT version", () => {
    assert.strictEqual(
      evaluateInTemplate("system-property('xsl:version')"),
      "1",
    );
  });

  it("should report the vendor", () => {
    assert.strictEqual(
      evaluateInTemplate("system-property('xsl:vendor')"),
      VENDOR,
    );
  });

  it("should report the vendor URL", () => {
    assert.strictEqual(
      evaluateInTemplate("system-property('xsl:vendor-url')"),
      VENDOR_URL,
    );
  });

  it("should return an empty string for unknown properties", () => {
    assert.strictEqual(
      evaluateInTemplate("system-property('xsl:unknown')"),
      "",
    );
  });
});

describe("function-available() and element-available()", () => {
  beforeEach(setupDOM);

  it("should report core and XSLT functions as available", () => {
    assert.strictEqual(
      evaluateInTemplate("function-available('concat')"),
      "true",
    );
    assert.strictEqual(
      evaluateInTemplate("function-available('format-number')"),
      "true",
    );
    assert.strictEqual(evaluateInTemplate("function-available('key')"), "true");
  });

  it("should report unknown functions as unavailable", () => {
    assert.strictEqual(
      evaluateInTemplate("function-available('nonesuch')"),
      "false",
    );
    assert.strictEqual(
      evaluateInTemplate("function-available('constructor')"),
      "false",
    );
  });

  it("should report XSLT elements as available", () => {
    assert.strictEqual(
      evaluateInTemplate("element-available('xsl:if')"),
      "true",
    );
    assert.strictEqual(
      evaluateInTemplate("element-available('xsl:apply-imports')"),
      "true",
    );
  });

  it("should report unknown XSLT elements as unavailable", () => {
    assert.strictEqual(
      evaluateInTemplate("element-available('xsl:result-document')"),
      "false",
    );
  });

  it("should report unprefixed and foreign names as unavailable", () => {
    assert.strictEqual(evaluateInTemplate("element-available('if')"), "false");

    const xslDoc = stylesheet(
      `<xsl:template match="/"><out><xsl:value-of select="element-available('foo:if')"/></out></xsl:template>`,
      'xmlns:foo="urn:foo"',
    );
    assert.strictEqual(
      transform(xslDoc, parseXML("<root/>")),
      "<out>false</out>",
    );
  });

  it("should accept any prefix bound to the XSLT namespace", () => {
    const engine = new XsltEngine();
    const doc = parseXML("<root/>");
    const context = new XPathContext(
      doc.documentElement,
      1,
      1,
      {},
      { x: XSLT_NAMESPACE },
    );

    assert.strictEqual(
      engine.xpathEvaluator.evaluate(
        parseXPath("element-available('x:if')"),
        context,
      ),
      true,
    );
  });
});

describe("unparsed-entity-uri()", () => {
  beforeEach(setupDOM);

  it("should return an empty string instead of failing", () => {
    assert.strictEqual(evaluateInTemplate("unparsed-entity-uri('e')"), "");
  });
});

describe("createXsltFunctions", () => {
  beforeEach(setupDOM);

  it("should expose the whole XSLT function library", () => {
    const engine = new XsltEngine();

    assert.deepStrictEqual(Object.keys(createXsltFunctions(engine)).sort(), [
      "current",
      "document",
      "element-available",
      "format-number",
      "function-available",
      "generate-id",
      "key",
      "system-property",
      "unparsed-entity-uri",
    ]);
  });
});

describe("recursive templates", () => {
  beforeEach(setupDOM);

  it("should evaluate a factorial written with xsl:call-template", () => {
    const xslDoc = stylesheet(
      `<xsl:template name="factorial">
         <xsl:param name="n"/>
         <xsl:choose>
           <xsl:when test="$n &lt;= 1">1</xsl:when>
           <xsl:otherwise>
             <xsl:variable name="rest">
               <xsl:call-template name="factorial">
                 <xsl:with-param name="n" select="$n - 1"/>
               </xsl:call-template>
             </xsl:variable>
             <xsl:value-of select="$n * $rest"/>
           </xsl:otherwise>
         </xsl:choose>
       </xsl:template>
       <xsl:template match="/"><out><xsl:call-template name="factorial"><xsl:with-param name="n" select="5"/></xsl:call-template></out></xsl:template>`,
    );

    assert.strictEqual(
      transform(xslDoc, parseXML("<root/>")),
      "<out>120</out>",
    );
  });
});
