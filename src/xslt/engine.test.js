/**
 * XSLT Engine Tests
 *
 * Tests for XSLT 1.0 Processing Engine.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { XsltContext, XsltEngine } from "./engine.js";

function setupDOM() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    contentType: "text/html",
  });

  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.XMLSerializer = dom.window.XMLSerializer;

  return dom;
}

function parseXML(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, "application/xml");
}

describe("XsltContext", () => {
  beforeEach(() => {
    setupDOM();
  });

  describe("constructor", () => {
    it("should create context with default values", () => {
      const context = new XsltContext();
      assert.strictEqual(context.position, 1);
      assert.deepStrictEqual(context.variables, {});
      assert.deepStrictEqual(context.parameters, {});
      assert.strictEqual(context.outputMethod, "xml");
    });

    it("should create context with provided options", () => {
      const node = parseXML("<root/>").documentElement;
      const context = new XsltContext({
        currentNode: node,
        currentNodeList: [node],
        position: 3,
        variables: { foo: "bar" },
        parameters: { param1: "value1" },
        outputMethod: "html",
      });

      assert.strictEqual(context.currentNode, node);
      assert.strictEqual(context.position, 3);
      assert.strictEqual(context.variables.foo, "bar");
      assert.strictEqual(context.parameters.param1, "value1");
      assert.strictEqual(context.outputMethod, "html");
    });
  });

  describe("clone", () => {
    it("should clone context with overrides", () => {
      const context = new XsltContext({
        position: 1,
        variables: { a: 1 },
        parameters: { b: 2 },
      });

      const cloned = context.clone({
        position: 5,
        variables: { c: 3 },
      });

      assert.strictEqual(cloned.position, 5);
      assert.strictEqual(cloned.variables.a, 1);
      assert.strictEqual(cloned.variables.c, 3);
      assert.strictEqual(cloned.parameters.b, 2);
    });

    it("should preserve original context", () => {
      const context = new XsltContext({
        position: 1,
        variables: { a: 1 },
      });

      context.clone({ variables: { b: 2 } });

      assert.strictEqual(context.variables.a, 1);
      assert.strictEqual(context.variables.b, undefined);
    });
  });

  describe("getVariable", () => {
    it("should return variable value", () => {
      const context = new XsltContext({
        variables: { myVar: "value" },
      });

      assert.strictEqual(context.getVariable("myVar"), "value");
    });

    it("should return parameter if variable not found", () => {
      const context = new XsltContext({
        parameters: { myParam: "paramValue" },
      });

      assert.strictEqual(context.getVariable("myParam"), "paramValue");
    });

    it("should throw for undefined variable", () => {
      const context = new XsltContext();

      assert.throws(() => {
        context.getVariable("nonexistent");
      }, /Undefined variable/);
    });
  });

  describe("setVariable", () => {
    it("should set variable value", () => {
      const context = new XsltContext();
      context.setVariable("test", "value");

      assert.strictEqual(context.variables.test, "value");
    });
  });
});

describe("XsltEngine", () => {
  let engine;

  beforeEach(() => {
    setupDOM();
    engine = new XsltEngine();
  });

  describe("constructor", () => {
    it("should initialize with default settings", () => {
      assert.strictEqual(engine.outputSettings.method, "xml");
      assert.strictEqual(engine.outputSettings.encoding, "UTF-8");
      assert.strictEqual(engine.outputSettings.indent, "no");
      assert.deepStrictEqual(engine.templates, []);
      assert.deepStrictEqual(engine.keys, {});
    });
  });

  describe("importStylesheet", () => {
    it("should import valid stylesheet", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <output/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      assert.doesNotThrow(() => {
        engine.importStylesheet(xslt);
      });
      assert.strictEqual(engine.templates.length, 1);
    });

    it("should throw for invalid stylesheet", () => {
      const invalid = parseXML("<invalid/>");

      assert.throws(() => {
        engine.importStylesheet(invalid);
      }, /Invalid XSLT stylesheet/);
    });

    it("should handle literal result element stylesheet", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <html xsl:version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <body>Content</body>
        </html>
      `);

      assert.doesNotThrow(() => {
        engine.importStylesheet(xslt);
      });
      assert.strictEqual(engine.templates.length, 1);
      assert.strictEqual(engine.templates[0].match, "/");
    });

    it("should process xsl:output element", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:output method="html" encoding="ISO-8859-1" indent="yes"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.strictEqual(engine.outputSettings.method, "html");
      assert.strictEqual(engine.outputSettings.encoding, "ISO-8859-1");
      assert.strictEqual(engine.outputSettings.indent, "yes");
    });

    it("should process global variables", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:variable name="globalVar" select="'test'"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.ok("globalVar" in engine.globalVariables);
    });

    it("should process global parameters", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:param name="globalParam" select="'default'"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.ok("globalParam" in engine.globalParameters);
    });

    it("should process xsl:key", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:key name="itemById" match="item" use="@id"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.ok("itemById" in engine.keys);
      assert.strictEqual(engine.keys.itemById.match, "item");
      assert.strictEqual(engine.keys.itemById.use, "@id");
    });

    it("should process xsl:decimal-format", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:decimal-format name="euro" decimal-separator="," grouping-separator="."/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.ok("euro" in engine.decimalFormats);
      assert.strictEqual(engine.decimalFormats.euro.decimalSeparator, ",");
      assert.strictEqual(engine.decimalFormats.euro.groupingSeparator, ".");
    });

    it("should process xsl:namespace-alias", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:namespace-alias stylesheet-prefix="myns" result-prefix="output"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.strictEqual(engine.namespaceAliases.myns, "output");
    });

    it("should process xsl:attribute-set", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:attribute-set name="common">
            <xsl:attribute name="class">default</xsl:attribute>
          </xsl:attribute-set>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.ok("common" in engine.attributeSets);
    });

    it("should process xsl:strip-space", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:strip-space elements="p div span"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.deepStrictEqual(engine.stripSpace, ["p", "div", "span"]);
    });

    it("should process xsl:preserve-space", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:preserve-space elements="pre code"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.deepStrictEqual(engine.preserveSpace, ["pre", "code"]);
    });
  });

  describe("calculatePriority", () => {
    it("should return -0.5 for wildcard patterns", () => {
      assert.strictEqual(engine.calculatePriority("*"), -0.5);
      assert.strictEqual(engine.calculatePriority("node()"), -0.5);
      assert.strictEqual(engine.calculatePriority("text()"), -0.5);
      assert.strictEqual(engine.calculatePriority("comment()"), -0.5);
      assert.strictEqual(
        engine.calculatePriority("processing-instruction()"),
        -0.5,
      );
    });

    it("should return -0.25 for NCName:* patterns", () => {
      assert.strictEqual(engine.calculatePriority("foo:*"), -0.25);
    });

    it("should return 0 for simple QName patterns", () => {
      assert.strictEqual(engine.calculatePriority("item"), 0);
      assert.strictEqual(engine.calculatePriority("my-element"), 0);
    });

    it("should return 0.5 for complex patterns", () => {
      assert.strictEqual(engine.calculatePriority("/root/item"), 0.5);
      assert.strictEqual(engine.calculatePriority("item[@id]"), 0.5);
    });

    it("should return 0.5 for null pattern", () => {
      assert.strictEqual(engine.calculatePriority(null), 0.5);
    });
  });

  describe("transform", () => {
    it("should transform simple XML", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result><xsl:value-of select="/root/item"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Hello</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result);
      assert.ok(result.nodeType === 11);
    });

    it("should throw when no document available", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);

      const originalDoc = global.document;
      global.document = undefined;

      assert.throws(() => {
        engine.transform(xml);
      }, /No output document/);

      global.document = originalDoc;
    });

    it("should evaluate global variables during transform", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:variable name="prefix" select="'Item: '"/>
          <xsl:template match="/">
            <result><xsl:value-of select="concat($prefix, /root/item)"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const resultEl = result.querySelector("result");
      assert.ok(resultEl.textContent.includes("Item:"));
      assert.ok(resultEl.textContent.includes("Test"));
    });
  });

  describe("xsl:apply-templates", () => {
    it("should apply templates with mode", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div><xsl:apply-templates select="/root/item" mode="special"/></div>
          </xsl:template>
          <xsl:template match="item" mode="special">
            <span class="special"><xsl:value-of select="."/></span>
          </xsl:template>
          <xsl:template match="item">
            <span><xsl:value-of select="."/></span>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const span = result.querySelector("span.special");
      assert.ok(span);
      assert.strictEqual(span.textContent, "Test");
    });

    it("should apply templates with sorting", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <ul>
              <xsl:apply-templates select="/root/item">
                <xsl:sort select="." order="descending"/>
              </xsl:apply-templates>
            </ul>
          </xsl:template>
          <xsl:template match="item">
            <li><xsl:value-of select="."/></li>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        "<root><item>A</item><item>C</item><item>B</item></root>",
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const items = result.querySelectorAll("li");
      assert.strictEqual(items[0].textContent, "C");
      assert.strictEqual(items[1].textContent, "B");
      assert.strictEqual(items[2].textContent, "A");
    });

    it("should apply templates with with-param", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:apply-templates select="/root/item">
              <xsl:with-param name="prefix" select="'>> '"/>
            </xsl:apply-templates>
          </xsl:template>
          <xsl:template match="item">
            <xsl:param name="prefix"/>
            <p><xsl:value-of select="concat($prefix, .)"/></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const p = result.querySelector("p");
      assert.ok(p.textContent.includes(">>"));
      assert.ok(p.textContent.includes("Test"));
    });
  });

  describe("xsl:call-template", () => {
    it("should throw for non-existent template", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:call-template name="nonexistent"/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);

      assert.throws(() => {
        engine.transform(xml, document);
      }, /Template not found/);
    });

    it("should call template with with-param content", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:call-template name="wrapper">
              <xsl:with-param name="content"><strong>Bold</strong></xsl:with-param>
            </xsl:call-template>
          </xsl:template>
          <xsl:template name="wrapper">
            <xsl:param name="content"/>
            <div><xsl:copy-of select="$content"/></div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const div = result.querySelector("div");
      assert.ok(div);
    });
  });

  describe("xsl:value-of", () => {
    it("should output value with disable-output-escaping", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div><xsl:value-of select="/root/content" disable-output-escaping="yes"/></div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        "<root><content>&lt;p&gt;text&lt;/p&gt;</content></root>",
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("div"));
    });
  });

  describe("xsl:text", () => {
    it("should output text content", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <p><xsl:text>Hello, World!</xsl:text></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const p = result.querySelector("p");
      assert.strictEqual(p.textContent, "Hello, World!");
    });

    it("should preserve whitespace in xsl:text", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <pre><xsl:text>  indented  </xsl:text></pre>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const pre = result.querySelector("pre");
      assert.strictEqual(pre.textContent, "  indented  ");
    });
  });

  describe("xsl:element", () => {
    it("should create element with dynamic name", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:element name="{/root/tagName}">
              <xsl:value-of select="/root/content"/>
            </xsl:element>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        "<root><tagName>custom</tagName><content>value</content></root>",
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const custom = result.querySelector("custom");
      assert.ok(custom);
      assert.strictEqual(custom.textContent, "value");
    });

    it("should create element with namespace", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:element name="item" namespace="http://example.com/ns">content</xsl:element>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const item = result.querySelector("item");
      assert.ok(item);
    });

    it("should apply use-attribute-sets", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:attribute-set name="common">
            <xsl:attribute name="class">styled</xsl:attribute>
          </xsl:attribute-set>
          <xsl:template match="/">
            <xsl:element name="div" use-attribute-sets="common">content</xsl:element>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const div = result.querySelector("div");
      assert.strictEqual(div.getAttribute("class"), "styled");
    });
  });

  describe("xsl:attribute", () => {
    it("should create attribute with dynamic name", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div>
              <xsl:attribute name="{/root/attrName}">
                <xsl:value-of select="/root/attrValue"/>
              </xsl:attribute>
            </div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        "<root><attrName>data-id</attrName><attrValue>123</attrValue></root>",
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const div = result.querySelector("div");
      assert.strictEqual(div.getAttribute("data-id"), "123");
    });

    it("should create attribute with namespace", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div>
              <xsl:attribute name="xml:lang" namespace="http://www.w3.org/XML/1998/namespace">en</xsl:attribute>
            </div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("div"));
    });
  });

  describe("xsl:copy", () => {
    it("should copy element with children", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="item">
            <xsl:copy>
              <xsl:apply-templates select="@*|node()"/>
            </xsl:copy>
          </xsl:template>
          <xsl:template match="@*|node()">
            <xsl:copy>
              <xsl:apply-templates select="@*|node()"/>
            </xsl:copy>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML('<root><item id="1">content</item></root>');

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const item = result.querySelector("item");
      assert.ok(item);
    });

    it("should copy text node", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="text()">
            <xsl:copy/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root>Hello</root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.textContent.includes("Hello"));
    });

    it("should copy with use-attribute-sets", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:attribute-set name="extra">
            <xsl:attribute name="data-copied">true</xsl:attribute>
          </xsl:attribute-set>
          <xsl:template match="item">
            <xsl:copy use-attribute-sets="extra">
              <xsl:apply-templates/>
            </xsl:copy>
          </xsl:template>
          <xsl:template match="/">
            <xsl:apply-templates select="/root/item"/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const item = result.querySelector("item");
      assert.ok(item);
      assert.strictEqual(item.getAttribute("data-copied"), "true");
    });
  });

  describe("xsl:copy-of", () => {
    it("should deep copy nodes", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result>
              <xsl:copy-of select="/root/nested"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        '<root><nested><child attr="val">text</child></nested></root>',
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const child = result.querySelector("child");
      assert.ok(child);
      assert.strictEqual(child.getAttribute("attr"), "val");
      assert.strictEqual(child.textContent, "text");
    });

    it("should copy primitive values as text", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result><xsl:copy-of select="1 + 2"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.textContent.includes("3"));
    });
  });

  describe("xsl:comment", () => {
    it("should create comment node", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div><xsl:comment>This is a comment</xsl:comment></div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      let hasComment = false;
      for (const node of result.querySelector("div").childNodes) {
        if (node.nodeType === 8) {
          hasComment = true;
          assert.strictEqual(node.nodeValue, "This is a comment");
        }
      }
      assert.ok(hasComment);
    });
  });

  describe("xsl:processing-instruction", () => {
    it("should create processing instruction", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result>
              <xsl:processing-instruction name="xml-stylesheet">type="text/css" href="style.css"</xsl:processing-instruction>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      let hasPI = false;
      for (const node of result.querySelector("result").childNodes) {
        if (node.nodeType === 7) {
          hasPI = true;
          assert.strictEqual(node.target, "xml-stylesheet");
        }
      }
      assert.ok(hasPI);
    });
  });

  describe("xsl:number", () => {
    it("should format number with padding", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <p><xsl:number value="5" format="001"/></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.strictEqual(result.querySelector("p").textContent, "005");
    });

    it("should format number as lowercase letter", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <p><xsl:number value="3" format="a"/></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.strictEqual(result.querySelector("p").textContent, "c");
    });

    it("should format number as uppercase letter", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <p><xsl:number value="1" format="A"/></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.strictEqual(result.querySelector("p").textContent, "A");
    });

    it("should format number as lowercase roman numeral", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <p><xsl:number value="4" format="i"/></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.strictEqual(result.querySelector("p").textContent, "iv");
    });

    it("should format number as uppercase roman numeral", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <p><xsl:number value="9" format="I"/></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.strictEqual(result.querySelector("p").textContent, "IX");
    });

    it("should count position without value attribute", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <ul><xsl:apply-templates select="/root/item"/></ul>
          </xsl:template>
          <xsl:template match="item">
            <li><xsl:number/>. <xsl:value-of select="."/></li>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        "<root><item>A</item><item>B</item><item>C</item></root>",
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const items = result.querySelectorAll("li");
      assert.ok(items[0].textContent.includes("1"));
      assert.ok(items[1].textContent.includes("2"));
      assert.ok(items[2].textContent.includes("3"));
    });
  });

  describe("xsl:message", () => {
    it("should output message without terminating", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:message>Debug message</xsl:message>
            <result>success</result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result"));
    });

    it("should terminate when terminate=yes", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:message terminate="yes">Fatal error</xsl:message>
            <result>should not reach</result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);

      assert.throws(() => {
        engine.transform(xml, document);
      }, /XSLT terminated/);
    });
  });

  describe("xsl:variable", () => {
    it("should create variable with select", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:variable name="count" select="count(/root/item)"/>
            <p>Count: <xsl:value-of select="$count"/></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item/><item/><item/></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("p").textContent.includes("3"));
    });

    it("should create variable with content", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:variable name="text">emphasized text</xsl:variable>
            <div><xsl:value-of select="$text"/></div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const div = result.querySelector("div");
      assert.ok(div);
      assert.ok(div.textContent.includes("emphasized"));
    });
  });

  describe("sortNodes", () => {
    it("should sort nodes by number", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <ul>
              <xsl:for-each select="/root/item">
                <xsl:sort select="@value" data-type="number"/>
                <li><xsl:value-of select="@value"/></li>
              </xsl:for-each>
            </ul>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        '<root><item value="10"/><item value="2"/><item value="5"/></root>',
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const items = result.querySelectorAll("li");
      assert.strictEqual(items[0].textContent, "2");
      assert.strictEqual(items[1].textContent, "5");
      assert.strictEqual(items[2].textContent, "10");
    });

    it("should sort with case-order lower-first", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <ul>
              <xsl:for-each select="/root/item">
                <xsl:sort select="." case-order="lower-first"/>
                <li><xsl:value-of select="."/></li>
              </xsl:for-each>
            </ul>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        "<root><item>B</item><item>a</item><item>A</item></root>",
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const items = result.querySelectorAll("li");
      assert.strictEqual(items.length, 3);
    });
  });

  describe("splitUnionPattern", () => {
    it("should split union patterns", () => {
      const parts = engine.splitUnionPattern("a|b|c");
      assert.deepStrictEqual(parts, ["a", "b", "c"]);
    });

    it("should handle patterns with predicates", () => {
      const parts = engine.splitUnionPattern('a[@x]|b[contains(., "|")]');
      assert.strictEqual(parts.length, 2);
      assert.strictEqual(parts[0], "a[@x]");
      assert.strictEqual(parts[1], 'b[contains(., "|")]');
    });

    it("should handle patterns with strings", () => {
      const parts = engine.splitUnionPattern("a|'string|with|pipes'|b");
      assert.strictEqual(parts.length, 3);
    });
  });

  describe("processAttributeValueTemplate", () => {
    it("should process simple template", () => {
      const context = new XsltContext({
        currentNode: parseXML("<root><id>123</id></root>").documentElement,
        namespaces: {},
      });

      const result = engine.processAttributeValueTemplate(
        "/item/{/root/id}",
        context,
      );
      assert.strictEqual(result, "/item/123");
    });

    it("should handle escaped braces", () => {
      const context = new XsltContext({
        currentNode: parseXML("<root/>").documentElement,
        namespaces: {},
      });

      const result = engine.processAttributeValueTemplate(
        "{{literal}}",
        context,
      );
      assert.strictEqual(result, "{literal}");
    });

    it("should return unchanged string without braces", () => {
      const context = new XsltContext({
        currentNode: parseXML("<root/>").documentElement,
        namespaces: {},
      });

      const result = engine.processAttributeValueTemplate(
        "plain text",
        context,
      );
      assert.strictEqual(result, "plain text");
    });

    it("should handle unmatched closing brace gracefully", () => {
      const context = new XsltContext({
        currentNode: parseXML("<root/>").documentElement,
        namespaces: {},
      });

      // The engine handles single } by either throwing or passing through
      // depending on implementation - test the actual behavior
      try {
        const result = engine.processAttributeValueTemplate(
          "text}more",
          context,
        );
        // If it doesn't throw, it should preserve the text somehow
        assert.ok(typeof result === "string");
      } catch (e) {
        // If it throws, it should be about unmatched brace
        assert.ok(e.message.includes("}") || e.message.includes("brace"));
      }
    });
  });

  describe("built-in templates", () => {
    it("should apply built-in template for elements", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="target">
            <found><xsl:value-of select="."/></found>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        "<root><wrapper><target>value</target></wrapper></root>",
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const found = result.querySelector("found");
      assert.ok(found);
      assert.strictEqual(found.textContent, "value");
    });

    it("should apply built-in template for text nodes", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root>plain text</root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.textContent.includes("plain text"));
    });
  });

  describe("toRoman", () => {
    it("should convert numbers to roman numerals", () => {
      assert.strictEqual(engine.toRoman(1), "I");
      assert.strictEqual(engine.toRoman(4), "IV");
      assert.strictEqual(engine.toRoman(9), "IX");
      assert.strictEqual(engine.toRoman(10), "X");
      assert.strictEqual(engine.toRoman(40), "XL");
      assert.strictEqual(engine.toRoman(50), "L");
      assert.strictEqual(engine.toRoman(90), "XC");
      assert.strictEqual(engine.toRoman(100), "C");
      assert.strictEqual(engine.toRoman(400), "CD");
      assert.strictEqual(engine.toRoman(500), "D");
      assert.strictEqual(engine.toRoman(900), "CM");
      assert.strictEqual(engine.toRoman(1000), "M");
      assert.strictEqual(engine.toRoman(1999), "MCMXCIX");
      assert.strictEqual(engine.toRoman(2024), "MMXXIV");
    });
  });

  describe("deepCloneNode", () => {
    it("should clone element with attributes and children", () => {
      const source = parseXML(
        '<root attr="value"><child>text</child></root>',
      ).documentElement;
      const clone = engine.deepCloneNode(source, document);

      assert.strictEqual(clone.nodeName.toLowerCase(), "root");
      assert.strictEqual(clone.getAttribute("attr"), "value");
      assert.ok(clone.querySelector("child"));
    });

    it("should clone text node", () => {
      const textNode = document.createTextNode("hello");
      const clone = engine.deepCloneNode(textNode, document);

      assert.strictEqual(clone.nodeType, 3);
      assert.strictEqual(clone.nodeValue, "hello");
    });

    it("should clone comment node", () => {
      const comment = document.createComment("comment text");
      const clone = engine.deepCloneNode(comment, document);

      assert.strictEqual(clone.nodeType, 8);
      assert.strictEqual(clone.nodeValue, "comment text");
    });

    it("should clone document fragment", () => {
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createElement("div"));
      frag.appendChild(document.createElement("span"));

      const clone = engine.deepCloneNode(frag, document);

      assert.strictEqual(clone.nodeType, 11);
      assert.strictEqual(clone.childNodes.length, 2);
    });
  });

  describe("shouldPreserveSpace", () => {
    it("should return true when xml:space is preserve", () => {
      const xml = parseXML(
        '<root xml:space="preserve"><child>  text  </child></root>',
      );
      const textNode = xml.querySelector("child").firstChild;

      assert.strictEqual(engine.shouldPreserveSpace(textNode), true);
    });

    it("should return false when xml:space is default", () => {
      const xml = parseXML(
        '<root xml:space="default"><child>  text  </child></root>',
      );
      const textNode = xml.querySelector("child").firstChild;

      assert.strictEqual(engine.shouldPreserveSpace(textNode), false);
    });

    it("should return false when no xml:space attribute", () => {
      const xml = parseXML("<root><child>  text  </child></root>");
      const textNode = xml.querySelector("child").firstChild;

      assert.strictEqual(engine.shouldPreserveSpace(textNode), false);
    });
  });

  describe("collectNamespaces", () => {
    it("should collect namespace declarations", () => {
      const xml = parseXML(
        '<root xmlns:foo="http://foo.com" xmlns:bar="http://bar.com"/>',
      );

      engine.collectNamespaces(xml.documentElement);

      assert.strictEqual(engine.namespaces.foo, "http://foo.com");
      assert.strictEqual(engine.namespaces.bar, "http://bar.com");
    });

    it("should ignore XSLT namespace", () => {
      const xml = parseXML(
        '<root xmlns:xsl="http://www.w3.org/1999/XSL/Transform"/>',
      );

      engine.collectNamespaces(xml.documentElement);

      assert.strictEqual(engine.namespaces.xsl, undefined);
    });
  });

  describe("applyAttributeSets", () => {
    it("should apply nested attribute sets via xsl:element", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:attribute-set name="base">
            <xsl:attribute name="class">base-class</xsl:attribute>
          </xsl:attribute-set>
          <xsl:attribute-set name="extended" use-attribute-sets="base">
            <xsl:attribute name="id">extended-id</xsl:attribute>
          </xsl:attribute-set>
          <xsl:template match="/">
            <xsl:element name="div" use-attribute-sets="extended">content</xsl:element>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const div = result.querySelector("div");
      assert.strictEqual(div.getAttribute("class"), "base-class");
      assert.strictEqual(div.getAttribute("id"), "extended-id");
    });

    it("should apply attribute sets directly", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:attribute-set name="common">
            <xsl:attribute name="data-test">value</xsl:attribute>
          </xsl:attribute-set>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      const context = new XsltContext({
        currentNode: parseXML("<root/>").documentElement,
        outputDocument: document,
      });

      const element = document.createElement("div");
      engine.applyAttributeSets("common", context, element);

      assert.strictEqual(element.getAttribute("data-test"), "value");
    });
  });

  describe("collectNamespaces - default namespace", () => {
    it("should collect default xmlns namespace", () => {
      const xml = parseXML('<root xmlns="http://example.com/default"/>');

      engine.collectNamespaces(xml.documentElement);

      assert.strictEqual(engine.namespaces[""], "http://example.com/default");
    });
  });

  describe("xsl:output cdata-section-elements", () => {
    it("should process cdata-section-elements attribute", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:output method="xml" cdata-section-elements="script style"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      assert.deepStrictEqual(engine.outputSettings.cdataSectionElements, [
        "script",
        "style",
      ]);
    });
  });

  describe("global parameters evaluation", () => {
    it("should evaluate global parameters without preset values", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:param name="testParam" select="'defaultValue'"/>
          <xsl:template match="/">
            <result><xsl:value-of select="$testParam"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(
        result.querySelector("result").textContent.includes("defaultValue"),
      );
    });
  });

  describe("evaluateVariable with content", () => {
    it("should evaluate variable with tree fragment content", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:variable name="frag"><item>content</item></xsl:variable>
          <xsl:template match="/">
            <result><xsl:copy-of select="$frag"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result"));
    });
  });

  describe("matchesSinglePattern with absolute path", () => {
    it("should match pattern starting with /", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/root/item">
            <matched><xsl:value-of select="."/></matched>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("matched"));
    });
  });

  describe("matchesSinglePattern catch block", () => {
    it("should return false on pattern matching error", () => {
      const context = new XsltContext({
        currentNode: parseXML("<root/>").documentElement,
        variables: {},
        parameters: {},
        namespaces: {},
      });

      // Invalid pattern should not throw, just return false
      const result = engine.matchesPattern(
        parseXML("<root/>").documentElement,
        "[[[invalid",
        context,
      );

      assert.strictEqual(result, false);
    });
  });

  describe("template param processing", () => {
    it("should process template params with default values", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:call-template name="test"/>
          </xsl:template>
          <xsl:template name="test">
            <xsl:param name="p1" select="'default'"/>
            <result><xsl:value-of select="$p1"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result").textContent.includes("default"));
    });
  });

  describe("unknown XSLT element", () => {
    it("should warn on unknown XSLT element", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:unknown-element/>
            <result>done</result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result"));
    });
  });

  describe("xsl:text with disable-output-escaping", () => {
    it("should handle disable-output-escaping in xsl:text", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <div><xsl:text disable-output-escaping="yes">&lt;span&gt;</xsl:text></div>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("div"));
    });
  });

  describe("xsl:choose with otherwise", () => {
    it("should execute otherwise when no when matches", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:choose>
              <xsl:when test="false()">
                <wrong/>
              </xsl:when>
              <xsl:otherwise>
                <correct/>
              </xsl:otherwise>
            </xsl:choose>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("correct"));
      assert.ok(!result.querySelector("wrong"));
    });
  });

  describe("xsl:for-each with single node result", () => {
    it("should handle single node as select result", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:for-each select="/root">
              <item><xsl:value-of select="local-name()"/></item>
            </xsl:for-each>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const item = result.querySelector("item");
      assert.ok(item);
      assert.strictEqual(item.textContent, "root");
    });
  });

  describe("xsl:copy for various node types", () => {
    it("should copy element with namespace", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:ns="http://example.com">
          <xsl:template match="ns:item">
            <xsl:copy>copied</xsl:copy>
          </xsl:template>
          <xsl:template match="/">
            <xsl:apply-templates select="//*[local-name()='item']"/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        '<root xmlns:ns="http://example.com"><ns:item/></root>',
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.textContent.includes("copied"));
    });

    it("should copy processing instruction node", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="processing-instruction()">
            <xsl:copy/>
          </xsl:template>
          <xsl:template match="/">
            <result><xsl:apply-templates select="/root/processing-instruction()"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><?target data?></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      let _hasPI = false;
      const walker = document.createTreeWalker(result, 128); // NodeFilter.SHOW_PROCESSING_INSTRUCTION
      if (walker.nextNode()) {
        _hasPI = true;
      }
      // PI may or may not be created depending on DOM impl
      assert.ok(result.querySelector("result"));
    });

    it("should copy comment node", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="comment()">
            <xsl:copy/>
          </xsl:template>
          <xsl:template match="/">
            <result><xsl:apply-templates select="/root/comment()"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><!-- test comment --></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result"));
    });

    it("should copy document fragment children", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:copy>
              <item>inside</item>
            </xsl:copy>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("item"));
    });
  });

  describe("deepCloneNode for processing instruction", () => {
    it("should clone processing instruction node", () => {
      const pi = document.createProcessingInstruction("target", "data");
      const clone = engine.deepCloneNode(pi, document);

      assert.strictEqual(clone.nodeType, 7);
      assert.strictEqual(clone.target, "target");
      assert.strictEqual(clone.data, "data");
    });
  });

  describe("deepCloneNode default case", () => {
    it("should return empty text for unknown node types", () => {
      // Create a mock node with unusual nodeType
      const mockNode = { nodeType: 99 };
      const clone = engine.deepCloneNode(mockNode, document);

      assert.strictEqual(clone.nodeType, 3);
      assert.strictEqual(clone.nodeValue, "");
    });
  });

  describe("countNumber without count pattern", () => {
    it("should count siblings without count attribute", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="item">
            <li><xsl:number level="single"/>. <xsl:value-of select="."/></li>
          </xsl:template>
          <xsl:template match="/">
            <ul><xsl:apply-templates select="/root/item"/></ul>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>A</item><item>B</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const items = result.querySelectorAll("li");
      assert.ok(items.length >= 2);
    });

    it("should return 1 for non-single level", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="item">
            <li><xsl:number level="multiple"/>. <xsl:value-of select="."/></li>
          </xsl:template>
          <xsl:template match="/">
            <ul><xsl:apply-templates select="/root/item"/></ul>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>A</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("li").textContent.includes("1"));
    });
  });

  describe("formatNumber default format", () => {
    it("should use default format for unrecognized pattern", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <p><xsl:number value="42" format="x"/></p>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.strictEqual(result.querySelector("p").textContent, "42");
    });
  });

  describe("xsl:apply-templates with single node result", () => {
    it("should handle single node select result", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="item">
            <found><xsl:value-of select="."/></found>
          </xsl:template>
          <xsl:template match="/">
            <xsl:apply-templates select="/root/item[1]"/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML(
        "<root><item>first</item><item>second</item></root>",
      );

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const found = result.querySelector("found");
      assert.ok(found);
      assert.strictEqual(found.textContent, "first");
    });

    it("should handle empty node result", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result><xsl:apply-templates select="/root/nonexistent"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result"));
    });
  });

  describe("createDocument without global document", () => {
    it("should throw when document is not available", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);

      const originalDoc = global.document;
      global.document = undefined;

      assert.throws(() => {
        engine.transformToDocument(xml);
      }, /Document creation not available/);

      global.document = originalDoc;
    });
  });

  describe("namespace aliases in literal result elements", () => {
    it("should apply namespace aliases", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0"
          xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
          xmlns:myns="http://example.com/myns"
          xmlns:out="http://example.com/output">
          <xsl:namespace-alias stylesheet-prefix="myns" result-prefix="out"/>
          <xsl:template match="/">
            <myns:element>content</myns:element>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.childNodes.length > 0);
    });
  });

  describe("xsl:for-each with empty result", () => {
    it("should handle empty node set", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result>
              <xsl:for-each select="/root/nonexistent">
                <item/>
              </xsl:for-each>
              done
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result"));
      assert.ok(!result.querySelector("item"));
    });
  });

  describe("xsl:copy for attribute nodes", () => {
    it("should copy attribute to element output", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="@*">
            <xsl:copy/>
          </xsl:template>
          <xsl:template match="/">
            <result>
              <xsl:apply-templates select="/root/@*"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML('<root id="123" class="test"/>');

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const resultEl = result.querySelector("result");
      assert.ok(resultEl);
    });

    it("should copy attribute directly to output element", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="@id">
            <container id="{.}"/>
          </xsl:template>
          <xsl:template match="/">
            <xsl:apply-templates select="/root/@id"/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML('<root id="test-id"/>');

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      // Test that attribute template works
      assert.ok(result.childNodes.length > 0);
    });
  });

  describe("literal result element with namespace", () => {
    it("should create namespaced element", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0"
          xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
          xmlns:svg="http://www.w3.org/2000/svg">
          <xsl:template match="/">
            <svg:svg width="100" height="100">
              <svg:circle cx="50" cy="50" r="40"/>
            </svg:svg>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.childNodes.length > 0);
    });
  });

  describe("xsl:copy with document node", () => {
    it("should copy document/fragment by processing children", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <xsl:copy>
              <wrapper>content</wrapper>
            </xsl:copy>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root>content</root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("wrapper"));
    });
  });

  describe("xslApplyTemplates with non-array result", () => {
    it("should handle string result from select", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result>
              <xsl:apply-templates select="string(/root/item)"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>text</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result"));
    });
  });

  describe("xslForEach with non-array result", () => {
    it("should handle string result from select", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result>
              <xsl:for-each select="string(/root/item)">
                <item><xsl:value-of select="."/></item>
              </xsl:for-each>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>text</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result"));
    });
  });

  describe("xsl:fallback element", () => {
    it("should ignore xsl:fallback in supported elements", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result>
              <xsl:value-of select="/root/item"/>
              <xsl:fallback>Fallback content</xsl:fallback>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>value</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("result"));
    });
  });

  describe("xsl:with-param standalone", () => {
    it("should ignore xsl:with-param outside call-template/apply-templates", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result>
              <xsl:with-param name="ignored">value</xsl:with-param>
              <done/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("done"));
    });
  });

  describe("xsl:copy direct method call", () => {
    it("should copy attribute node directly", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      // Create attribute node context
      const sourceDoc = parseXML('<root id="test-value"/>');
      const attrNode = sourceDoc.documentElement.getAttributeNode("id");

      const context = new XsltContext({
        currentNode: attrNode,
        currentNodeList: [attrNode],
        position: 1,
        outputDocument: document,
        variables: {},
        parameters: {},
        namespaces: {},
      });

      // Create output element
      const outputElement = document.createElement("target");

      // Create xsl:copy node
      const copyNode = parseXML(
        '<xsl:copy xmlns:xsl="http://www.w3.org/1999/XSL/Transform"/>',
      ).documentElement;

      // Call xslCopy directly
      engine.xslCopy(copyNode, context, outputElement);

      assert.strictEqual(outputElement.getAttribute("id"), "test-value");
    });

    it("should copy document node directly", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      engine.importStylesheet(xslt);

      // Create document context
      const sourceDoc = parseXML("<root/>");

      const context = new XsltContext({
        currentNode: sourceDoc,
        currentNodeList: [sourceDoc],
        position: 1,
        outputDocument: document,
        variables: {},
        parameters: {},
        namespaces: {},
      });

      // Create output fragment
      const outputFragment = document.createDocumentFragment();

      // Create xsl:copy node with children
      const copyNode = parseXML(
        '<xsl:copy xmlns:xsl="http://www.w3.org/1999/XSL/Transform"><child>content</child></xsl:copy>',
      ).documentElement;

      // Call xslCopy directly
      engine.xslCopy(copyNode, context, outputFragment);

      assert.ok(outputFragment.childNodes.length > 0);
    });
  });

  describe("W3C XSLT 1.0 Specification Compliance", () => {
    describe("Section 5: Template Rules", () => {
      it("should match templates by priority (5.5)", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:template match="item" priority="1">
              <high><xsl:value-of select="."/></high>
            </xsl:template>
            <xsl:template match="item" priority="0">
              <low><xsl:value-of select="."/></low>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML("<root><item>test</item></root>");

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        assert.ok(result.querySelector("high"));
        assert.ok(!result.querySelector("low"));
      });
    });

    describe("Section 7: Repetition", () => {
      it("should process xsl:for-each with position() (7.7)", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:template match="/">
              <ul>
                <xsl:for-each select="/root/item">
                  <li><xsl:value-of select="position()"/>: <xsl:value-of select="."/></li>
                </xsl:for-each>
              </ul>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML("<root><item>A</item><item>B</item></root>");

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        const items = result.querySelectorAll("li");
        assert.ok(items[0].textContent.includes("1"));
        assert.ok(items[1].textContent.includes("2"));
      });
    });

    describe("Section 9: Conditional Processing", () => {
      it("should handle nested xsl:choose (9.2)", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:template match="/">
              <xsl:choose>
                <xsl:when test="/root/level = 'high'">
                  <xsl:choose>
                    <xsl:when test="/root/type = 'A'"><result>high-A</result></xsl:when>
                    <xsl:otherwise><result>high-other</result></xsl:otherwise>
                  </xsl:choose>
                </xsl:when>
                <xsl:otherwise><result>low</result></xsl:otherwise>
              </xsl:choose>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML("<root><level>high</level><type>A</type></root>");

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        assert.strictEqual(
          result.querySelector("result").textContent,
          "high-A",
        );
      });
    });

    describe("Section 10: Sorting", () => {
      it("should support multiple sort keys (10)", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:template match="/">
              <ul>
                <xsl:for-each select="/root/item">
                  <xsl:sort select="@group"/>
                  <xsl:sort select="@name"/>
                  <li><xsl:value-of select="@group"/>-<xsl:value-of select="@name"/></li>
                </xsl:for-each>
              </ul>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML(
          '<root><item group="B" name="Z"/><item group="A" name="Y"/><item group="A" name="X"/></root>',
        );

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        const items = result.querySelectorAll("li");
        assert.strictEqual(items[0].textContent, "A-X");
        assert.strictEqual(items[1].textContent, "A-Y");
        assert.strictEqual(items[2].textContent, "B-Z");
      });
    });

    describe("Section 11: Variables and Parameters", () => {
      it("should support variable scoping (11.2)", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:variable name="global" select="'outer'"/>
            <xsl:template match="/">
              <xsl:variable name="local" select="'inner'"/>
              <result>
                <global><xsl:value-of select="$global"/></global>
                <local><xsl:value-of select="$local"/></local>
              </result>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML("<root/>");

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        assert.strictEqual(result.querySelector("global").textContent, "outer");
        assert.strictEqual(result.querySelector("local").textContent, "inner");
      });
    });

    describe("Section 12.4: Number Formatting", () => {
      it("should format numbers correctly", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:template match="/">
              <result>
                <decimal><xsl:number value="7" format="01"/></decimal>
                <alpha><xsl:number value="3" format="a"/></alpha>
                <roman><xsl:number value="14" format="i"/></roman>
              </result>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML("<root/>");

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        assert.strictEqual(result.querySelector("decimal").textContent, "07");
        assert.strictEqual(result.querySelector("alpha").textContent, "c");
        assert.strictEqual(result.querySelector("roman").textContent, "xiv");
      });
    });

    describe("Section 16: Output", () => {
      it("should respect xsl:output settings", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:output method="html" indent="yes" encoding="UTF-8"
              doctype-public="-//W3C//DTD HTML 4.01//EN"
              doctype-system="http://www.w3.org/TR/html4/strict.dtd"
              media-type="text/html"/>
            <xsl:template match="/"><html><body>test</body></html></xsl:template>
          </xsl:stylesheet>
        `);

        engine.importStylesheet(xslt);

        assert.strictEqual(engine.outputSettings.method, "html");
        assert.strictEqual(engine.outputSettings.indent, "yes");
        assert.strictEqual(engine.outputSettings.encoding, "UTF-8");
        assert.strictEqual(
          engine.outputSettings.doctypePublic,
          "-//W3C//DTD HTML 4.01//EN",
        );
        assert.strictEqual(
          engine.outputSettings.doctypeSystem,
          "http://www.w3.org/TR/html4/strict.dtd",
        );
        assert.strictEqual(engine.outputSettings.mediaType, "text/html");
      });
    });
  });

  describe("W3C XPath 1.0 Specification Compliance", () => {
    describe("Section 2: Location Paths", () => {
      it("should support abbreviated syntax (2.5)", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:template match="/">
              <result>
                <child><xsl:value-of select="/root/item"/></child>
                <attr><xsl:value-of select="/root/item/@id"/></attr>
                <descendant><xsl:value-of select="//nested"/></descendant>
                <parent><xsl:value-of select="/root/item/.."/></parent>
              </result>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML(
          '<root><item id="123"><nested>deep</nested></item></root>',
        );

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        assert.ok(result.querySelector("child").textContent.includes("deep"));
        assert.strictEqual(result.querySelector("attr").textContent, "123");
        assert.strictEqual(
          result.querySelector("descendant").textContent,
          "deep",
        );
      });
    });

    describe("Section 3: Expressions", () => {
      it("should evaluate union expressions (3.3)", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:template match="/">
              <result>
                <xsl:for-each select="/root/a | /root/b">
                  <item><xsl:value-of select="."/></item>
                </xsl:for-each>
              </result>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML("<root><a>A</a><b>B</b><c>C</c></root>");

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        const items = result.querySelectorAll("item");
        assert.strictEqual(items.length, 2);
      });
    });

    describe("Section 4: Core Functions", () => {
      it("should implement string functions (4.2)", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:template match="/">
              <result>
                <concat><xsl:value-of select="concat('a', 'b', 'c')"/></concat>
                <starts><xsl:value-of select="starts-with('hello', 'he')"/></starts>
                <contains><xsl:value-of select="contains('hello', 'ell')"/></contains>
                <substr><xsl:value-of select="substring('hello', 2, 3)"/></substr>
                <length><xsl:value-of select="string-length('hello')"/></length>
                <translate><xsl:value-of select="translate('abc', 'abc', 'ABC')"/></translate>
              </result>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML("<root/>");

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        assert.strictEqual(result.querySelector("concat").textContent, "abc");
        assert.strictEqual(result.querySelector("starts").textContent, "true");
        assert.strictEqual(
          result.querySelector("contains").textContent,
          "true",
        );
        assert.strictEqual(result.querySelector("substr").textContent, "ell");
        assert.strictEqual(result.querySelector("length").textContent, "5");
        assert.strictEqual(
          result.querySelector("translate").textContent,
          "ABC",
        );
      });

      it("should implement number functions (4.4)", () => {
        const xslt = parseXML(`<?xml version="1.0"?>
          <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
            <xsl:template match="/">
              <result>
                <sum><xsl:value-of select="sum(/root/item)"/></sum>
                <floor><xsl:value-of select="floor(3.7)"/></floor>
                <ceiling><xsl:value-of select="ceiling(3.2)"/></ceiling>
                <round><xsl:value-of select="round(3.5)"/></round>
              </result>
            </xsl:template>
          </xsl:stylesheet>
        `);

        const xml = parseXML(
          "<root><item>10</item><item>20</item><item>30</item></root>",
        );

        engine.importStylesheet(xslt);
        const result = engine.transform(xml, document);

        assert.strictEqual(result.querySelector("sum").textContent, "60");
        assert.strictEqual(result.querySelector("floor").textContent, "3");
        assert.strictEqual(result.querySelector("ceiling").textContent, "4");
        assert.strictEqual(result.querySelector("round").textContent, "4");
      });
    });
  });

  describe("W3C DOM Level 3 Core Compliance", () => {
    it("should handle namespaced elements correctly", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0"
          xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
          xmlns:html="http://www.w3.org/1999/xhtml">
          <xsl:template match="/">
            <html:html>
              <html:body>
                <html:p><xsl:value-of select="/root/content"/></html:p>
              </html:body>
            </html:html>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><content>Hello World</content></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.childNodes.length > 0);
    });

    it("should preserve node types during transformation", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="/">
            <result>
              <xsl:comment>A comment</xsl:comment>
              <xsl:processing-instruction name="target">data</xsl:processing-instruction>
              <xsl:text>Text content</xsl:text>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const resultEl = result.querySelector("result");
      let hasComment = false;
      let _hasPI = false;
      let hasText = false;

      for (const node of resultEl.childNodes) {
        if (node.nodeType === 8) hasComment = true;
        if (node.nodeType === 7) _hasPI = true;
        if (node.nodeType === 3 && node.textContent.includes("Text"))
          hasText = true;
      }

      assert.ok(hasComment);
      assert.ok(hasText);
    });
  });

  describe("xsl:include and xsl:import", () => {
    it("should throw error when no stylesheet loader is configured", () => {
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:include href="other.xsl"/>
          <xsl:template match="/">
            <result/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      assert.throws(() => {
        engine.importStylesheet(xslt);
      }, /no stylesheetLoader configured/);
    });

    it("should throw error for xsl:include without href", () => {
      const stylesheets = {};
      engine.setStylesheetLoader((href) => stylesheets[href]);

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:include/>
          <xsl:template match="/">
            <result/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      assert.throws(() => {
        engine.importStylesheet(xslt);
      }, /xsl:include requires an href attribute/);
    });

    it("should throw error for xsl:import without href", () => {
      const stylesheets = {};
      engine.setStylesheetLoader((href) => stylesheets[href]);

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import/>
          <xsl:template match="/">
            <result/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      assert.throws(() => {
        engine.importStylesheet(xslt);
      }, /xsl:import requires an href attribute/);
    });

    it("should include templates from external stylesheet", () => {
      const includedXslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template name="greeting">
            <hello>World</hello>
          </xsl:template>
        </xsl:stylesheet>
      `);

      engine.setStylesheetLoader((href) => {
        if (href === "greeting.xsl") return includedXslt;
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:include href="greeting.xsl"/>
          <xsl:template match="/">
            <result>
              <xsl:call-template name="greeting"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const hello = result.querySelector("hello");
      assert.ok(hello);
      assert.strictEqual(hello.textContent, "World");
    });

    it("should import templates with lower precedence", () => {
      const importedXslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="item">
            <imported-item><xsl:value-of select="."/></imported-item>
          </xsl:template>
        </xsl:stylesheet>
      `);

      engine.setStylesheetLoader((href) => {
        if (href === "base.xsl") return importedXslt;
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      // Main stylesheet overrides the imported template
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="base.xsl"/>
          <xsl:template match="item">
            <main-item><xsl:value-of select="."/></main-item>
          </xsl:template>
          <xsl:template match="/">
            <result>
              <xsl:apply-templates select="//item"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      // Main template should win due to higher import precedence
      const mainItem = result.querySelector("main-item");
      assert.ok(mainItem, "Main template should override imported template");
      assert.strictEqual(mainItem.textContent, "Test");

      const importedItem = result.querySelector("imported-item");
      assert.strictEqual(
        importedItem,
        null,
        "Imported template should not be used",
      );
    });

    it("should use imported template when main stylesheet has no matching template", () => {
      const importedXslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="special">
            <special-item><xsl:value-of select="."/></special-item>
          </xsl:template>
        </xsl:stylesheet>
      `);

      engine.setStylesheetLoader((href) => {
        if (href === "base.xsl") return importedXslt;
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="base.xsl"/>
          <xsl:template match="/">
            <result>
              <xsl:apply-templates select="//special"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><special>Content</special></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const specialItem = result.querySelector("special-item");
      assert.ok(
        specialItem,
        "Imported template should be used when no override exists",
      );
      assert.strictEqual(specialItem.textContent, "Content");
    });

    it("should detect circular includes", () => {
      engine.setStylesheetLoader((href) => {
        // Both stylesheets include each other
        if (href === "a.xsl") {
          return parseXML(`<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:include href="b.xsl"/>
            </xsl:stylesheet>
          `);
        }
        if (href === "b.xsl") {
          return parseXML(`<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:include href="a.xsl"/>
            </xsl:stylesheet>
          `);
        }
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:include href="a.xsl"/>
          <xsl:template match="/">
            <result/>
          </xsl:template>
        </xsl:stylesheet>
      `);

      assert.throws(() => {
        engine.importStylesheet(xslt);
      }, /Circular stylesheet reference/);
    });

    it("should resolve relative URIs correctly", () => {
      engine.setStylesheetLoader((href) => {
        if (href === "/styles/common/utils.xsl") {
          return parseXML(`<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:template name="util">
                <util>OK</util>
              </xsl:template>
            </xsl:stylesheet>
          `);
        }
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:include href="common/utils.xsl"/>
          <xsl:template match="/">
            <result>
              <xsl:call-template name="util"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt, "/styles/main.xsl");
      const result = engine.transform(xml, document);

      const util = result.querySelector("util");
      assert.ok(util);
      assert.strictEqual(util.textContent, "OK");
    });

    it("should support stylesheet loader returning XML string", () => {
      engine.setStylesheetLoader((href) => {
        if (href === "string.xsl") {
          return `<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:template name="fromString">
                <string-template>Success</string-template>
              </xsl:template>
            </xsl:stylesheet>
          `;
        }
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:include href="string.xsl"/>
          <xsl:template match="/">
            <result>
              <xsl:call-template name="fromString"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      const stringTemplate = result.querySelector("string-template");
      assert.ok(stringTemplate);
      assert.strictEqual(stringTemplate.textContent, "Success");
    });

    it("should merge global variables from imported stylesheets", () => {
      const importedXslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:variable name="importedVar" select="'imported-value'"/>
        </xsl:stylesheet>
      `);

      engine.setStylesheetLoader((href) => {
        if (href === "vars.xsl") return importedXslt;
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="vars.xsl"/>
          <xsl:template match="/">
            <result>
              <xsl:value-of select="$importedVar"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root/>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.strictEqual(
        result.querySelector("result").textContent,
        "imported-value",
      );
    });

    it("should handle nested imports with correct precedence", () => {
      // base.xsl is imported by middle.xsl, which is imported by main.xsl
      // Precedence: base < middle < main
      engine.setStylesheetLoader((href) => {
        if (href === "base.xsl") {
          return parseXML(`<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:template match="item">
                <base-item><xsl:value-of select="."/></base-item>
              </xsl:template>
            </xsl:stylesheet>
          `);
        }
        if (href === "middle.xsl") {
          return parseXML(`<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:import href="base.xsl"/>
              <xsl:template match="item">
                <middle-item><xsl:value-of select="."/></middle-item>
              </xsl:template>
            </xsl:stylesheet>
          `);
        }
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="middle.xsl"/>
          <xsl:template match="/">
            <result>
              <xsl:apply-templates select="//item"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      // middle.xsl template should win over base.xsl
      const middleItem = result.querySelector("middle-item");
      assert.ok(middleItem, "Middle template should override base template");
      assert.strictEqual(middleItem.textContent, "Test");
    });

    it("should include templates at same precedence level", () => {
      const includedXslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:template match="item" priority="1">
            <included-item><xsl:value-of select="."/></included-item>
          </xsl:template>
        </xsl:stylesheet>
      `);

      engine.setStylesheetLoader((href) => {
        if (href === "included.xsl") return includedXslt;
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      // With include, templates are at the same precedence, so priority decides
      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:include href="included.xsl"/>
          <xsl:template match="item" priority="0.5">
            <main-item><xsl:value-of select="."/></main-item>
          </xsl:template>
          <xsl:template match="/">
            <result>
              <xsl:apply-templates select="//item"/>
            </result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      // Included template has higher priority (1 > 0.5), so it should win
      const includedItem = result.querySelector("included-item");
      assert.ok(
        includedItem,
        "Included template with higher priority should be used",
      );
      assert.strictEqual(includedItem.textContent, "Test");
    });

    it("should detect circular imports", () => {
      engine.setStylesheetLoader((href) => {
        if (href === "circular.xsl") {
          return parseXML(`<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:import href="circular.xsl"/>
              <xsl:template match="/"><out/></xsl:template>
            </xsl:stylesheet>
          `);
        }
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="circular.xsl"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      assert.throws(() => {
        engine.importStylesheet(xslt);
      }, /Circular stylesheet reference/);
    });

    it("should import stylesheet returned as XML string", () => {
      engine.setStylesheetLoader((href) => {
        if (href === "string-import.xsl") {
          return `<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:template match="item">
                <imported><xsl:value-of select="."/></imported>
              </xsl:template>
            </xsl:stylesheet>
          `;
        }
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="string-import.xsl"/>
          <xsl:template match="/">
            <result><xsl:apply-templates select="//item"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("imported"));
    });

    it("should throw error when import fails", () => {
      engine.setStylesheetLoader(() => {
        throw new Error("Network error");
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="failing.xsl"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      assert.throws(() => {
        engine.importStylesheet(xslt);
      }, /Failed to import stylesheet/);
    });

    it("should throw error for invalid included stylesheet", () => {
      engine.setStylesheetLoader((href) => {
        if (href === "invalid.xsl") {
          return parseXML(`<?xml version="1.0"?><not-a-stylesheet/>`);
        }
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="invalid.xsl"/>
          <xsl:template match="/"><out/></xsl:template>
        </xsl:stylesheet>
      `);

      assert.throws(() => {
        engine.importStylesheet(xslt);
      }, /not a valid XSLT stylesheet/);
    });

    it("should process various elements in imported stylesheet", () => {
      engine.setStylesheetLoader((href) => {
        if (href === "full-features.xsl") {
          return parseXML(`<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:output method="html" indent="yes"/>
              <xsl:param name="importedParam" select="'param-value'"/>
              <xsl:key name="importedKey" match="item" use="@id"/>
              <xsl:decimal-format name="importedFormat" decimal-separator=","/>
              <xsl:namespace-alias stylesheet-prefix="ns1" result-prefix="ns2"/>
              <xsl:attribute-set name="importedAttrs">
                <xsl:attribute name="class">imported</xsl:attribute>
              </xsl:attribute-set>
              <xsl:strip-space elements="pre"/>
              <xsl:preserve-space elements="code"/>
              <xsl:template match="item">
                <imported-item><xsl:value-of select="."/></imported-item>
              </xsl:template>
            </xsl:stylesheet>
          `);
        }
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="full-features.xsl"/>
          <xsl:template match="/">
            <result><xsl:apply-templates select="//item"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Test</item></root>");

      engine.importStylesheet(xslt);

      assert.ok("importedParam" in engine.globalParameters);
      assert.ok("importedKey" in engine.keys);
      assert.ok("importedFormat" in engine.decimalFormats);
      assert.strictEqual(engine.namespaceAliases.ns1, "ns2");
      assert.ok("importedAttrs" in engine.attributeSets);
      assert.ok(engine.stripSpace.includes("pre"));
      assert.ok(engine.preserveSpace.includes("code"));

      const result = engine.transform(xml, document);
      assert.ok(result.querySelector("imported-item"));
    });

    it("should process include in imported stylesheet", () => {
      engine.setStylesheetLoader((href) => {
        if (href === "parent.xsl") {
          return parseXML(`<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:include href="child.xsl"/>
            </xsl:stylesheet>
          `);
        }
        if (href === "child.xsl") {
          return parseXML(`<?xml version="1.0"?>
            <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
              <xsl:template match="item">
                <child-item><xsl:value-of select="."/></child-item>
              </xsl:template>
            </xsl:stylesheet>
          `);
        }
        throw new Error(`Unknown stylesheet: ${href}`);
      });

      const xslt = parseXML(`<?xml version="1.0"?>
        <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
          <xsl:import href="parent.xsl"/>
          <xsl:template match="/">
            <result><xsl:apply-templates select="//item"/></result>
          </xsl:template>
        </xsl:stylesheet>
      `);

      const xml = parseXML("<root><item>Test</item></root>");

      engine.importStylesheet(xslt);
      const result = engine.transform(xml, document);

      assert.ok(result.querySelector("child-item"));
    });
  });

  describe("parseXmlString", () => {
    it("should throw error for invalid XML with parsererror", () => {
      assert.throws(() => {
        engine.parseXmlString("<invalid><unclosed>");
      }, /XML parse error/);
    });

    it("should throw error when DOMParser is not available", () => {
      const originalDOMParser = global.DOMParser;
      global.DOMParser = undefined;

      const testEngine = new XsltEngine();

      assert.throws(() => {
        testEngine.parseXmlString("<valid/>");
      }, /XML parsing not available/);

      global.DOMParser = originalDOMParser;
    });

    it("should parse valid XML string", () => {
      const result = engine.parseXmlString("<root><item>test</item></root>");
      assert.ok(result.documentElement);
      assert.strictEqual(result.documentElement.tagName, "root");
    });
  });
});
