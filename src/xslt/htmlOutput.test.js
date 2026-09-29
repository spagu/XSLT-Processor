/**
 * html output method details (XSLT 1.0 section 16.2), aligned with libxslt:
 * the content type meta element added to `head`, attribute value escaping
 * (`&{` and `<` stay unescaped) and %-escaping of non-ASCII characters in
 * URI attributes.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { serializeResult } from "./serializer.js";

const { window } = new JSDOM("");

/**
 * Parse markup into a document.
 *
 * @param {string} xml - Markup
 * @returns {Document} The document
 */
function parseXml(xml) {
  return new window.DOMParser().parseFromString(xml, "application/xml");
}

/**
 * Serialize markup with the html output method.
 *
 * @param {string} xml - Result tree markup
 * @param {object} [settings] - Extra output settings
 * @returns {string} The serialized result
 */
function html(xml, settings = {}) {
  return serializeResult(parseXml(xml), { method: "html", ...settings });
}

const META_UTF8 =
  '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">';

describe("content type meta element", () => {
  it("is inserted as the first child of head", () => {
    assert.strictEqual(
      html("<html><head><title>t</title></head><body/></html>"),
      `<html><head>${META_UTF8}<title>t</title></head><body></body></html>`,
    );
  });

  it("names the output encoding and media type", () => {
    assert.strictEqual(
      html("<html><HEAD/></html>", {
        encoding: "ISO-8859-1",
        mediaType: "application/xhtml+xml",
      }),
      '<html><HEAD><meta http-equiv="Content-Type" ' +
        'content="application/xhtml+xml; charset=ISO-8859-1"></HEAD></html>',
    );
  });

  it("is indented like the other children", () => {
    assert.strictEqual(
      html("<html><head><title>t</title></head></html>", { indent: "yes" }),
      `<html>\n  <head>\n    ${META_UTF8}\n    <title>t</title>\n  </head>\n</html>`,
    );
  });

  it("is not added when the stylesheet writes one", () => {
    for (const meta of [
      '<meta http-equiv="content-type" content="text/html"/>',
      '<META HTTP-EQUIV="Content-Type" content="text/html"/>',
      '<meta charset="utf-8"/>',
    ]) {
      const out = html(`<html><head>${meta}</head></html>`);
      assert.strictEqual(out.match(/<meta/gi).length, 1, out);
    }
  });

  it("is added next to unrelated meta elements", () => {
    assert.strictEqual(
      html('<html><head><meta name="a" content="b"/></head></html>'),
      `<html><head>${META_UTF8}<meta name="a" content="b"></head></html>`,
    );
  });

  it("is not added to a head element in a namespace", () => {
    assert.strictEqual(
      html('<html><h:head xmlns:h="urn:h"/></html>'),
      "<html><h:head></h:head></html>",
    );
  });

  it("is not added by the xml output method", () => {
    assert.strictEqual(
      serializeResult(parseXml("<html><head/></html>"), { method: "xml" }),
      '<?xml version="1.0" encoding="UTF-8"?>\n<html><head/></html>',
    );
  });
});

describe("html attribute values", () => {
  it("keep & before { and < unescaped", () => {
    const doc = parseXml("<html><p/></html>");
    doc.documentElement.firstChild.setAttribute("title", '&{x} &amp; <b> "q"');
    assert.strictEqual(
      serializeResult(doc, { method: "html" }),
      '<html><p title="&{x} &amp;amp; <b> &quot;q&quot;"></p></html>',
    );
  });

  it("%-escape spaces, controls and non-ASCII characters of URI attributes like libxml2", () => {
    const doc = parseXml("<html><a/><img/><form/><p/><a/></html>");
    const [a, img, form, p, named] = doc.documentElement.childNodes;
    a.setAttribute("href", " \thttp://x/é ü?q=é&r=%41#😀\u007f\t{x}[y]|");
    img.setAttribute("SRC", "é");
    form.setAttribute("action", "a b");
    form.setAttribute("formaction", "a b");
    p.setAttribute("title", "é");
    p.setAttribute("cite", "a b");
    named.setAttribute("name", "a b");
    assert.strictEqual(
      serializeResult(doc, { method: "html" }),
      '<html><a href=" \thttp://x/%C3%A9%20%C3%BC?q=%C3%A9&amp;r=%41#%F0%9F%98%80%7F%09{x}[y]|"></a>' +
        '<img SRC="%C3%A9"><form action="a%20b" formaction="a b"></form>' +
        '<p title="é" cite="a b"></p><a name="a%20b"></a></html>',
    );
  });

  it("do not %-escape attributes of elements in a namespace", () => {
    const doc = parseXml('<html><a xmlns="urn:x" href="a b"/></html>');
    assert.match(serializeResult(doc, { method: "html" }), /href="a b"/);
  });

  it("do not %-escape attributes in a namespace", () => {
    const doc = parseXml("<html><a/></html>");
    doc.documentElement.firstChild.setAttributeNS("urn:x", "x:href", "é");
    assert.strictEqual(
      serializeResult(doc, { method: "html" }),
      '<html><a x:href="é"></a></html>',
    );
  });
});
