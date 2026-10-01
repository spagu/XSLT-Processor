import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMImplementation, DOMParser } from "@xmldom/xmldom";
import { evaluateXPath } from "../../xpath/index.js";
import { serialize } from "../index.js";

const parse = (text) => new DOMParser().parseFromString(text, "text/xml");
const xml = (text, params = {}) =>
  serialize([parse(text)], { omitXmlDeclaration: true, ...params });
const code = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
};
const XMLNS = "http://www.w3.org/2000/xmlns/";

describe("the xml output method", () => {
  it("writes the XML declaration", () => {
    const doc = parse("<a/>");
    assert.equal(
      serialize([doc]),
      '<?xml version="1.0" encoding="UTF-8"?><a/>',
    );
    assert.equal(
      serialize([doc], {
        standalone: "yes",
        encoding: "ISO-8859-1",
        indent: true,
      }),
      '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>\n<a/>',
    );
  });

  it("writes elements, text, comments and processing instructions", () => {
    const text =
      '<a x="1&amp;&lt;&quot;">t&lt;<!--c--><?pi d?><?e?><![CDATA[<x>]]><b></b></a>';
    assert.equal(
      xml(text),
      '<a x="1&amp;&lt;&quot;">t&lt;<!--c--><?pi d?><?e?>&lt;x&gt;<b/></a>',
    );
  });

  it("writes CDATA sections in cdata-section-elements", () => {
    const text =
      '<a xmlns:p="urn:p"><b>x<![CDATA[y]]></b><p:b>z</p:b><c>w</c></a>';
    assert.equal(
      xml(text, { cdataSectionElements: ["b", "Q{urn:p}b"] }),
      '<a xmlns:p="urn:p"><b><![CDATA[xy]]></b><p:b><![CDATA[z]]></p:b><c>w</c></a>',
    );
  });

  it("writes the document type declaration", () => {
    assert.equal(
      xml("<!DOCTYPE r><!--c--><r/>", { doctypeSystem: "r.dtd" }),
      '<!--c--><!DOCTYPE r SYSTEM "r.dtd">\n<r/>',
    );
    assert.equal(
      xml("<r/>", { doctypeSystem: "s", doctypePublic: "p" }),
      '<!DOCTYPE r PUBLIC "p" "s">\n<r/>',
    );
    assert.equal(xml("<r/>", { doctypePublic: "p" }), "<r/>");
    assert.equal(
      code(() => serialize(evaluateXPath("'a'"), { doctypeSystem: "s" })),
      "SEPM0004",
    );
    assert.equal(
      code(() =>
        serialize([parse("<a/>"), parse("<b/>")], { standalone: "no" }),
      ),
      "SEPM0004",
    );
  });

  it("serializes sequences", () => {
    const items = evaluateXPath("(1, 'a', [2, [3]], '', 4)");
    assert.equal(serialize(items, { omitXmlDeclaration: true }), "1 a 2 3  4");
    const doc = parse("<r><e/><f/></r>");
    const children = evaluateXPath("/r/*", doc);
    assert.equal(
      serialize(children, { omitXmlDeclaration: true, itemSeparator: " " }),
      "<e/> <f/>",
    );
    assert.equal(
      serialize(evaluateXPath("1 to 3"), {
        method: "xml",
        itemSeparator: "|",
      }).endsWith("1|2|3"),
      true,
    );
    assert.equal(
      code(() => serialize(evaluateXPath("/r/namespace::xml", doc))),
      "SENR0001",
    );
  });
});

describe("namespace fixup", () => {
  it("declares inherited namespaces of a subtree", () => {
    const doc = parse('<r xmlns="urn:d" xmlns:p="urn:p"><p:e><f/></p:e></r>');
    const [e] = evaluateXPath("/*/*", doc);
    assert.equal(
      serialize([e], { omitXmlDeclaration: true }),
      '<p:e xmlns="urn:d" xmlns:p="urn:p"><f/></p:e>',
    );
  });

  it("undeclares the default namespace", () => {
    assert.equal(
      xml('<a xmlns="urn:a"><b xmlns=""/></a>'),
      '<a xmlns="urn:a"><b xmlns=""/></a>',
    );
    assert.equal(
      xml('<a xmlns="urn:a?b&amp;c"/>'),
      '<a xmlns="urn:a?b&amp;c"/>',
    );
  });

  it("declares names built without declarations", () => {
    const doc = new DOMImplementation().createDocument("urn:a", "p:a", null);
    const a = doc.documentElement;
    const b = doc.createElementNS("urn:b", "b");
    a.appendChild(b);
    b.setAttributeNS("urn:c", "c:x", "1");
    b.setAttributeNS("urn:a", "y", "2");
    b.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:lang", "en");
    const z = doc.createElementNS("urn:z", "p:z");
    z.setAttributeNS("urn:q", "p:w", "3");
    z.setAttributeNS("urn:r", "v", "4");
    b.appendChild(z);
    assert.equal(
      serialize([doc], { omitXmlDeclaration: true }),
      '<p:a xmlns:p="urn:a"><b xmlns="urn:b" xmlns:c="urn:c" c:x="1" p:y="2" xml:lang="en">' +
        '<p:z xmlns:p="urn:z" xmlns:ns0="urn:q" xmlns:ns1="urn:r" ns0:w="3" ns1:v="4"/></b></p:a>',
    );
  });

  it("undeclares prefixes in XML 1.1", () => {
    const doc = new DOMImplementation().createDocument("urn:p", "p:a", null);
    const b = doc.createElementNS("", "b");
    b.setAttributeNS(XMLNS, "xmlns:p", "");
    doc.documentElement.appendChild(b);
    const params = { omitXmlDeclaration: true, version: "1.1" };
    assert.equal(
      serialize([doc], { ...params, undeclarePrefixes: true }),
      '<p:a xmlns:p="urn:p"><b xmlns:p=""/></p:a>',
    );
    assert.equal(serialize([doc], params), '<p:a xmlns:p="urn:p"><b/></p:a>');
  });
});
