/**
 * cdata-section-elements compares expanded names (XSLT 1.0 section 16.1):
 * a namespace URI and a local name, never a bare local name in any namespace.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { resolveOutputSettings, serializeResult } from "./serializer.js";

const { window } = new JSDOM("");

/**
 * Serialize markup with the given cdata-section-elements setting.
 *
 * @param {string} xml - Result tree markup
 * @param {*} cdataSectionElements - The setting
 * @returns {string} The serialized result
 */
function serialize(xml, cdataSectionElements) {
  const doc = new window.DOMParser().parseFromString(xml, "application/xml");
  return serializeResult(doc, {
    omitXmlDeclaration: "yes",
    cdataSectionElements,
  });
}

describe("cdata-section-elements", () => {
  it("matches resolved expanded names", () => {
    const names = [
      { namespaceUri: "urn:p", localName: "c" },
      { namespaceUri: null, localName: "d" },
    ];
    assert.strictEqual(
      serialize(
        `<o xmlns:p="urn:p" xmlns:q="urn:p"><p:c>x</p:c><q:c>y</q:c>` +
          `<c>n</c><d>z</d><p:d>w</p:d></o>`,
        names,
      ),
      `<o xmlns:p="urn:p" xmlns:q="urn:p"><p:c><![CDATA[x]]></p:c>` +
        `<q:c><![CDATA[y]]></q:c><c>n</c><d><![CDATA[z]]></d><p:d>w</p:d></o>`,
    );
  });

  it("treats an empty namespace URI as no namespace", () => {
    assert.strictEqual(
      serialize(`<o><d>z</d></o>`, [{ namespaceUri: "", localName: "d" }]),
      `<o><d><![CDATA[z]]></d></o>`,
    );
  });

  it("does not match an unprefixed name in another namespace", () => {
    assert.strictEqual(
      serialize(`<c xmlns="urn:d">x</c>`, "c"),
      `<c xmlns="urn:d">x</c>`,
    );
    assert.strictEqual(
      serialize(`<p:c xmlns:p="urn:p">x</p:c>`, ["c"]),
      `<p:c xmlns:p="urn:p">x</p:c>`,
    );
  });

  it("resolves the prefix of a plain QName in the result tree", () => {
    assert.strictEqual(
      serialize(
        `<o xmlns:p="urn:p" xmlns:q="urn:p" xmlns:r="urn:r">` +
          `<p:c>x</p:c><q:c>y</q:c><r:c>z</r:c></o>`,
        "p:c",
      ),
      `<o xmlns:p="urn:p" xmlns:q="urn:p" xmlns:r="urn:r">` +
        `<p:c><![CDATA[x]]></p:c><q:c><![CDATA[y]]></q:c><r:c>z</r:c></o>`,
    );
    assert.strictEqual(serialize(`<o><c>x</c></o>`, "zz:c"), `<o><c>x</c></o>`);
  });

  it("normalizes the setting into expanded name keys", () => {
    const settings = resolveOutputSettings(
      {
        cdataSectionElements: [
          "a",
          "p:b",
          { namespaceUri: "urn:x", localName: "c" },
        ],
      },
      null,
    );
    assert.deepStrictEqual(
      [...settings.cdataSectionElements],
      ["a", "{urn:x}c"],
    );
    assert.deepStrictEqual(settings.cdataSectionQNames, [
      { prefix: "p", localName: "b" },
    ]);
    assert.strictEqual(
      resolveOutputSettings({}, null).cdataSectionElements.size,
      0,
    );
  });
});

describe("character data serialization (libxslt bug-90, bug-105, bug-106)", () => {
  it("writes adjacent text nodes as one CDATA section", () => {
    const doc = new window.DOMParser().parseFromString(
      "<o><d>a</d></o>",
      "application/xml",
    );
    const d = doc.documentElement.firstChild;
    d.append(doc.createTextNode("b"), doc.createCDATASection("c"));
    const raw = doc.createTextNode("<x/>");
    raw._disableOutputEscaping = true;
    d.append(raw, doc.createTextNode("e"), doc.createComment("k"));
    assert.strictEqual(
      serializeResult(doc, {
        omitXmlDeclaration: "yes",
        cdataSectionElements: "d",
      }),
      "<o><d><![CDATA[abc]]><x/><![CDATA[e]]><!--k--></d></o>",
    );
  });

  it("escapes a carriage return in text and attributes", () => {
    const doc = new window.DOMParser().parseFromString(
      "<o/>",
      "application/xml",
    );
    doc.documentElement.setAttribute("a", "\t\r");
    doc.documentElement.textContent = "x\ry";
    assert.strictEqual(
      serializeResult(doc, { omitXmlDeclaration: "yes" }),
      '<o a="&#9;&#13;">x&#13;y</o>',
    );
  });
});
