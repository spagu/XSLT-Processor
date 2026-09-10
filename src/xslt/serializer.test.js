/**
 * Output Serializer Tests
 *
 * Tests for XSLT 1.0 section 16 output serialization (xsl:output).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import {
  serializeResult,
  markRawText,
  isRawText,
  findRootElement,
  detectOutputMethod,
  resolveOutputSettings,
} from "./serializer.js";

/**
 * Install a JSDOM based DOM implementation into the global scope.
 * @returns {JSDOM} The created JSDOM instance
 */
function setupDOM() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    contentType: "text/html",
  });

  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.XMLSerializer = dom.window.XMLSerializer;

  return dom;
}

/**
 * Parse an XML string into a Document.
 * @param {string} xmlString - XML source text
 * @returns {Document} Parsed document
 */
function parseXML(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, "application/xml");
}

describe("serializeResult", () => {
  beforeEach(() => {
    setupDOM();
  });

  describe("guards", () => {
    it("should return empty string for null input", () => {
      assert.strictEqual(serializeResult(null), "");
    });

    it("should return empty string for undefined input", () => {
      assert.strictEqual(serializeResult(undefined), "");
    });

    it("should serialize with default settings when omitted", () => {
      const doc = parseXML("<root/>");
      assert.strictEqual(
        serializeResult(doc),
        '<?xml version="1.0" encoding="UTF-8"?>\n<root/>',
      );
    });
  });

  describe("xml method", () => {
    it("should indent nested empty elements (DesignLiquido #219)", () => {
      const doc = parseXML("<BAR><QUX></QUX></BAR>");
      const output = serializeResult(doc, {
        method: "xml",
        indent: "yes",
      });

      assert.strictEqual(
        output,
        '<?xml version="1.0" encoding="UTF-8"?>\n<BAR>\n  <QUX/>\n</BAR>',
      );
    });

    it("should omit the XML declaration when requested", () => {
      const doc = parseXML("<BAR><QUX></QUX></BAR>");
      const output = serializeResult(doc, {
        method: "xml",
        indent: "yes",
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(output, "<BAR>\n  <QUX/>\n</BAR>");
    });

    it("should honor encoding, version and standalone", () => {
      const doc = parseXML("<root/>");
      const output = serializeResult(doc, {
        encoding: "ISO-8859-1",
        version: "1.1",
        standalone: "yes",
      });

      assert.strictEqual(
        output,
        '<?xml version="1.1" encoding="ISO-8859-1" standalone="yes"?>\n<root/>',
      );
    });

    it("should emit a SYSTEM doctype when only doctype-system is given", () => {
      const doc = parseXML("<root/>");
      const output = serializeResult(doc, {
        omitXmlDeclaration: "yes",
        doctypeSystem: "root.dtd",
      });

      assert.strictEqual(output, '<!DOCTYPE root SYSTEM "root.dtd">\n<root/>');
    });

    it("should emit a PUBLIC doctype when both doctype parts are given", () => {
      const doc = parseXML("<root/>");
      const output = serializeResult(doc, {
        omitXmlDeclaration: "yes",
        doctypePublic: "-//X//DTD//EN",
        doctypeSystem: "root.dtd",
      });

      assert.strictEqual(
        output,
        '<!DOCTYPE root PUBLIC "-//X//DTD//EN" "root.dtd">\n<root/>',
      );
    });

    it("should not emit a doctype without doctype-system", () => {
      const doc = parseXML("<root/>");
      const output = serializeResult(doc, {
        omitXmlDeclaration: "yes",
        doctypePublic: "-//X//DTD//EN",
      });

      assert.strictEqual(output, "<root/>");
    });

    it("should not emit a doctype when there is no root element", () => {
      const doc = parseXML("<root/>");
      const fragment = doc.createDocumentFragment();
      fragment.appendChild(doc.createTextNode("bare"));

      const output = serializeResult(fragment, {
        omitXmlDeclaration: "yes",
        doctypeSystem: "root.dtd",
      });

      assert.strictEqual(output, "bare");
    });

    it("should escape text content", () => {
      const doc = parseXML("<root/>");
      doc.documentElement.appendChild(
        doc.createTextNode("a < b & c > d ]]> e"),
      );

      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });
      assert.strictEqual(output, "<root>a &lt; b &amp; c > d ]]&gt; e</root>");
    });

    it("should escape attribute values", () => {
      const doc = parseXML("<root/>");
      doc.documentElement.setAttribute("a", 'x<y&z"w>v');
      doc.documentElement.setAttribute("b", "line\nbreak");

      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });
      assert.strictEqual(
        output,
        '<root a="x&lt;y&amp;z&quot;w&gt;v" b="line&#10;break"/>',
      );
    });

    it("should serialize comments and processing instructions", () => {
      const doc = parseXML("<root/>");
      doc.documentElement.appendChild(doc.createComment(" note "));
      doc.documentElement.appendChild(
        doc.createProcessingInstruction("php", "echo 1;"),
      );

      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });
      assert.strictEqual(output, "<root><!-- note --><?php echo 1;?></root>");
    });

    it("should serialize a processing instruction without data", () => {
      const doc = parseXML("<root/>");
      doc.documentElement.appendChild(
        doc.createProcessingInstruction("stop", ""),
      );

      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });
      assert.strictEqual(output, "<root><?stop?></root>");
    });

    it("should serialize a bare element node", () => {
      const doc = parseXML("<root><a>x</a></root>");
      const output = serializeResult(doc.documentElement.firstChild, {
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(output, "<a>x</a>");
    });

    it("should serialize CDATA source nodes as CDATA", () => {
      const doc = parseXML("<root><![CDATA[a<b]]></root>");
      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });

      assert.strictEqual(output, "<root><![CDATA[a<b]]></root>");
    });

    it("should ignore unsupported node types", () => {
      const doc = parseXML("<root/>");
      const output = serializeResult(doc.createAttribute("x"), {
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(output, "");
    });
  });

  describe("xml namespaces", () => {
    it("should declare a default namespace once", () => {
      const doc = parseXML('<root xmlns="urn:a"><child/></root>');
      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });

      assert.strictEqual(output, '<root xmlns="urn:a"><child/></root>');
    });

    it("should undeclare the default namespace for a no-namespace child", () => {
      const doc = parseXML('<root xmlns="urn:a"/>');
      const child = doc.createElement("plain");
      doc.documentElement.appendChild(child);

      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });
      assert.strictEqual(
        output,
        '<root xmlns="urn:a"><plain xmlns=""/></root>',
      );
    });

    it("should declare prefixed namespaces used by attributes", () => {
      const doc = parseXML("<root/>");
      doc.documentElement.setAttributeNS("urn:b", "b:flag", "1");

      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });
      assert.strictEqual(output, '<root xmlns:b="urn:b" b:flag="1"/>');
    });

    it("should keep unused namespace declarations from the source", () => {
      const doc = parseXML('<root xmlns:unused="urn:u"><a/></root>');
      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });

      assert.strictEqual(output, '<root xmlns:unused="urn:u"><a/></root>');
    });

    it("should not redeclare an inherited prefixed namespace", () => {
      const doc = parseXML(
        '<p:root xmlns:p="urn:p"><p:child><p:leaf/></p:child></p:root>',
      );
      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });

      assert.strictEqual(
        output,
        '<p:root xmlns:p="urn:p"><p:child><p:leaf/></p:child></p:root>',
      );
    });

    it("should not declare the reserved xml prefix", () => {
      const doc = parseXML("<root/>");
      doc.documentElement.setAttributeNS(
        "http://www.w3.org/XML/1998/namespace",
        "xml:lang",
        "en",
      );

      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });
      assert.strictEqual(output, '<root xml:lang="en"/>');
    });
  });

  describe("xml indentation", () => {
    it("should not indent mixed content", () => {
      const doc = parseXML("<root>text<b>bold</b>tail</root>");
      const output = serializeResult(doc, {
        indent: "yes",
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(output, "<root>text<b>bold</b>tail</root>");
    });

    it("should ignore whitespace-only text nodes when indenting", () => {
      const doc = parseXML("<root>\n   <a/>\n   <b/>\n</root>");
      const output = serializeResult(doc, {
        indent: "yes",
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(output, "<root>\n  <a/>\n  <b/>\n</root>");
    });

    it("should indent comments and processing instructions", () => {
      const doc = parseXML("<root><a/></root>");
      doc.documentElement.appendChild(doc.createComment("c"));
      doc.documentElement.appendChild(
        doc.createProcessingInstruction("pi", "d"),
      );

      const output = serializeResult(doc, {
        indent: "yes",
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(
        output,
        "<root>\n  <a/>\n  <!--c-->\n  <?pi d?>\n</root>",
      );
    });

    it("should indent deeply nested elements", () => {
      const doc = parseXML("<a><b><c><d/></c></b></a>");
      const output = serializeResult(doc, {
        indent: "yes",
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(
        output,
        "<a>\n  <b>\n    <c>\n      <d/>\n    </c>\n  </b>\n</a>",
      );
    });

    it("should not indent an element with only whitespace text", () => {
      const doc = parseXML("<root>   </root>");
      const output = serializeResult(doc, {
        indent: "yes",
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(output, "<root>   </root>");
    });

    it("should not indent around CDATA children", () => {
      const doc = parseXML("<root><![CDATA[x]]><a/></root>");
      const output = serializeResult(doc, {
        indent: "yes",
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(output, "<root><![CDATA[x]]><a/></root>");
    });
  });

  describe("cdata-section-elements", () => {
    it("should wrap text children in CDATA sections", () => {
      const doc = parseXML("<root><script>if (a &lt; b) x();</script></root>");
      const output = serializeResult(doc, {
        omitXmlDeclaration: "yes",
        cdataSectionElements: ["script"],
      });

      assert.strictEqual(
        output,
        "<root><script><![CDATA[if (a < b) x();]]></script></root>",
      );
    });

    it("should accept a whitespace separated string", () => {
      const doc = parseXML("<root><a>x</a><b>y</b></root>");
      const output = serializeResult(doc, {
        omitXmlDeclaration: "yes",
        cdataSectionElements: "a b",
      });

      assert.strictEqual(
        output,
        "<root><a><![CDATA[x]]></a><b><![CDATA[y]]></b></root>",
      );
    });

    it("should split text containing the CDATA terminator", () => {
      const doc = parseXML("<root><a/></root>");
      const target = doc.documentElement.firstChild;
      target.appendChild(doc.createTextNode("before ]]> after"));

      const output = serializeResult(doc, {
        omitXmlDeclaration: "yes",
        cdataSectionElements: ["a"],
      });

      assert.strictEqual(
        output,
        "<root><a><![CDATA[before ]]]]><![CDATA[> after]]></a></root>",
      );
    });

    it("should not indent inside cdata-section-elements", () => {
      const doc = parseXML("<root><a><b/></a></root>");
      const output = serializeResult(doc, {
        indent: "yes",
        omitXmlDeclaration: "yes",
        cdataSectionElements: ["a"],
      });

      assert.strictEqual(output, "<root>\n  <a><b/></a>\n</root>");
    });
  });

  describe("html method", () => {
    it("should detect html output from the document element", () => {
      const doc = parseXML("<html><body><br/></body></html>");
      const output = serializeResult(doc, {});

      assert.strictEqual(output, "<html><body><br></body></html>");
    });

    it("should not detect html for a namespaced root element", () => {
      const doc = parseXML('<html xmlns="urn:x"/>');
      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });

      assert.strictEqual(output, '<html xmlns="urn:x"/>');
    });

    it("should emit a public doctype", () => {
      const doc = parseXML("<html><body>hi</body></html>");
      const output = serializeResult(doc, {
        method: "html",
        doctypePublic: "-//W3C//DTD HTML 4.01//EN",
        doctypeSystem: "http://www.w3.org/TR/html4/strict.dtd",
      });

      assert.strictEqual(
        output,
        '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" ' +
          '"http://www.w3.org/TR/html4/strict.dtd">\n' +
          "<html><body>hi</body></html>",
      );
    });

    it("should emit a public-only doctype", () => {
      const doc = parseXML("<html/>");
      const output = serializeResult(doc, {
        method: "html",
        doctypePublic: "-//W3C//DTD HTML 4.01//EN",
      });

      assert.strictEqual(
        output,
        '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN">\n<html></html>',
      );
    });

    it("should emit a system-only doctype", () => {
      const doc = parseXML("<html/>");
      const output = serializeResult(doc, {
        method: "html",
        doctypeSystem: "about:legacy-compat",
      });

      assert.strictEqual(
        output,
        '<!DOCTYPE html SYSTEM "about:legacy-compat">\n<html></html>',
      );
    });

    it("should fall back to the html doctype name without a root element", () => {
      const doc = parseXML("<root/>");
      const fragment = doc.createDocumentFragment();
      fragment.appendChild(doc.createTextNode("bare"));

      const output = serializeResult(fragment, {
        method: "html",
        doctypeSystem: "about:legacy-compat",
      });

      assert.strictEqual(
        output,
        '<!DOCTYPE html SYSTEM "about:legacy-compat">\nbare',
      );
    });

    it("should write void elements without a slash", () => {
      const doc = parseXML(
        "<html><body><br/><hr/><img src='a.png'/></body></html>",
      );
      const output = serializeResult(doc, { method: "html" });

      assert.strictEqual(
        output,
        '<html><body><br><hr><img src="a.png"></body></html>',
      );
    });

    it("should minimize boolean attributes", () => {
      const doc = parseXML("<html><input checked='checked' value='1'/></html>");
      const output = serializeResult(doc, { method: "html" });

      assert.strictEqual(output, '<html><input checked value="1"></html>');
    });

    it("should not escape script and style contents", () => {
      const doc = parseXML(
        "<html><script>if (a &lt; b &amp;&amp; c) x();</script>" +
          "<style>a &gt; b { color: red }</style></html>",
      );
      const output = serializeResult(doc, { method: "html" });

      assert.strictEqual(
        output,
        "<html><script>if (a < b && c) x();</script>" +
          "<style>a > b { color: red }</style></html>",
      );
    });

    it("should escape ampersands but keep URIs intact", () => {
      const doc = parseXML("<html/>");
      const link = doc.createElement("a");
      link.setAttribute("href", "/search?q=a&p=1");
      doc.documentElement.appendChild(link);

      const output = serializeResult(doc, { method: "html" });
      assert.strictEqual(
        output,
        '<html><a href="/search?q=a&amp;p=1"></a></html>',
      );
    });

    it("should escape markup characters in text", () => {
      const doc = parseXML("<html><p>a &lt; b &amp; c</p></html>");
      const output = serializeResult(doc, { method: "html" });

      assert.strictEqual(output, "<html><p>a &lt; b &amp; c</p></html>");
    });

    it("should not emit namespace declarations", () => {
      const doc = parseXML(
        '<html xmlns="http://www.w3.org/1999/xhtml"><p/></html>',
      );
      const output = serializeResult(doc, { method: "html" });

      assert.strictEqual(output, "<html><p></p></html>");
    });

    it("should terminate processing instructions with a single bracket", () => {
      const doc = parseXML("<html/>");
      doc.documentElement.appendChild(
        doc.createProcessingInstruction("php", "echo 1;"),
      );

      const output = serializeResult(doc, { method: "html" });
      assert.strictEqual(output, "<html><?php echo 1;></html>");
    });

    it("should preserve element and attribute name case", () => {
      const doc = parseXML("<html><DIV dataValue='1'/></html>");
      const output = serializeResult(doc, { method: "html" });

      assert.strictEqual(output, '<html><DIV dataValue="1"></DIV></html>');
    });

    it("should indent like xml", () => {
      const doc = parseXML("<html><body><p>hi</p></body></html>");
      const output = serializeResult(doc, { method: "html", indent: "yes" });

      assert.strictEqual(
        output,
        "<html>\n  <body>\n    <p>hi</p>\n  </body>\n</html>",
      );
    });

    it("should never indent inside pre, script, style or textarea", () => {
      const doc = parseXML(
        "<html><pre><a/></pre><textarea><b/></textarea></html>",
      );
      const output = serializeResult(doc, { method: "html", indent: "yes" });

      assert.strictEqual(
        output,
        "<html>\n  <pre><a></a></pre>\n" +
          "  <textarea><b></b></textarea>\n</html>",
      );
    });

    it("should escape CDATA source nodes as text", () => {
      const doc = parseXML("<html><p><![CDATA[a<b]]></p></html>");
      const output = serializeResult(doc, { method: "html" });

      assert.strictEqual(output, "<html><p>a&lt;b</p></html>");
    });
  });

  describe("xhtml method", () => {
    it("should write void elements with a slash", () => {
      const doc = parseXML("<html><body><br/><p/></body></html>");
      const output = serializeResult(doc, {
        method: "xhtml",
        omitXmlDeclaration: "yes",
      });

      assert.strictEqual(output, "<html><body><br /><p/></body></html>");
    });
  });

  describe("text method", () => {
    it("should concatenate descendant text without escaping", () => {
      const doc = parseXML(
        "<root><a>Total: </a><b>5 &lt; 6</b><!--skip--></root>",
      );
      const output = serializeResult(doc, { method: "text" });

      assert.strictEqual(output, "Total: 5 < 6");
    });

    it("should include CDATA content", () => {
      const doc = parseXML("<root><![CDATA[<raw>]]></root>");
      const output = serializeResult(doc, { method: "text" });

      assert.strictEqual(output, "<raw>");
    });

    it("should serialize a lone text node", () => {
      const doc = parseXML("<root/>");
      const output = serializeResult(doc.createTextNode("plain"), {
        method: "text",
      });

      assert.strictEqual(output, "plain");
    });

    it("should return an empty string for a childless non-text node", () => {
      const doc = parseXML("<root/>");
      const output = serializeResult(doc.createAttribute("x"), {
        method: "text",
      });

      assert.strictEqual(output, "");
    });
  });

  describe("settings", () => {
    it("should find the root element of documents and elements", () => {
      const doc = parseXML("<root><a/></root>");

      assert.strictEqual(findRootElement(doc), doc.documentElement);
      assert.strictEqual(
        findRootElement(doc.documentElement),
        doc.documentElement,
      );
      assert.strictEqual(findRootElement(null), null);
      assert.strictEqual(findRootElement(doc.createTextNode("x")), null);
    });

    it("should detect the default output method", () => {
      assert.strictEqual(detectOutputMethod(parseXML("<HTML/>")), "html");
      assert.strictEqual(detectOutputMethod(parseXML("<root/>")), "xml");
      assert.strictEqual(detectOutputMethod(null), "xml");
    });

    it("should normalize raw engine settings", () => {
      const settings = resolveOutputSettings(
        {
          method: " HTML ",
          indent: "YES",
          omitXmlDeclaration: true,
          cdataSectionElements: ["a"],
          mediaType: "text/html",
        },
        null,
      );

      assert.strictEqual(settings.method, "html");
      assert.strictEqual(settings.indent, true);
      assert.strictEqual(settings.omitXmlDeclaration, true);
      assert.strictEqual(settings.mediaType, "text/html");
      assert.strictEqual(settings.version, "1.0");
      assert.strictEqual(settings.standalone, null);
      assert.ok(settings.cdataSectionElements.has("a"));
    });

    it("should fall back to detection for an empty or auto method", () => {
      assert.strictEqual(resolveOutputSettings(null, null).method, "xml");
      assert.strictEqual(
        resolveOutputSettings({ method: "auto" }, parseXML("<html/>")).method,
        "html",
      );
      assert.strictEqual(
        resolveOutputSettings({ method: "" }, parseXML("<html/>")).method,
        "html",
      );
    });
  });

  describe("disable-output-escaping", () => {
    it("should emit marked text nodes raw in xml output", () => {
      const doc = parseXML("<root/>");
      const raw = doc.createTextNode("<b>bold</b>");
      markRawText(raw);
      doc.documentElement.appendChild(raw);

      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });
      assert.strictEqual(output, "<root><b>bold</b></root>");
    });

    it("should emit marked text nodes raw in html output", () => {
      const doc = parseXML("<html/>");
      const raw = doc.createTextNode("<b>bold</b>");
      markRawText(raw);
      doc.documentElement.appendChild(raw);

      const output = serializeResult(doc, { method: "html" });
      assert.strictEqual(output, "<html><b>bold</b></html>");
    });

    it("should honor the engine _disableOutputEscaping flag", () => {
      const doc = parseXML("<root/>");
      const raw = doc.createTextNode("<b>bold</b>");
      raw._disableOutputEscaping = true;
      doc.documentElement.appendChild(raw);

      const output = serializeResult(doc, { omitXmlDeclaration: "yes" });
      assert.strictEqual(output, "<root><b>bold</b></root>");
    });

    it("should bypass CDATA wrapping for marked text", () => {
      const doc = parseXML("<root><a/></root>");
      const raw = doc.createTextNode("<b/>");
      markRawText(raw);
      doc.documentElement.firstChild.appendChild(raw);

      const output = serializeResult(doc, {
        omitXmlDeclaration: "yes",
        cdataSectionElements: ["a"],
      });

      assert.strictEqual(output, "<root><a><b/></a></root>");
    });

    it("should report marked and unmarked nodes", () => {
      const doc = parseXML("<root/>");
      const raw = doc.createTextNode("x");
      const plain = doc.createTextNode("y");

      assert.strictEqual(isRawText(raw), false);
      assert.strictEqual(markRawText(raw), raw);
      assert.strictEqual(isRawText(raw), true);
      assert.strictEqual(isRawText(plain), false);
      assert.strictEqual(isRawText(null), false);
      assert.strictEqual(markRawText(null), null);
    });
  });
});
