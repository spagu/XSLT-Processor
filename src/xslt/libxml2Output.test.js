/**
 * Serialization details libxml2 (and so Chrome's XSLTProcessor) applies,
 * with the libxslt conformance cases they come from: XHTML 1.0 documents
 * (general/bug-152, documents/bredfort, namespaces/tst7), html doctypes
 * derived from `version` (general/bug-206) and line breaks between
 * top-level nodes (general/bug-195).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { serializeResult } from "./serializer.js";
import { htmlDoctypeMarkup } from "./serializer/htmlDoctype.js";

const { window } = new JSDOM("");

const STRICT = {
  doctypePublic: "-//W3C//DTD XHTML 1.0 Strict//EN",
  doctypeSystem: "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd",
};

/**
 * Serialize markup.
 *
 * @param {string} xml - Result tree markup
 * @param {object} settings - Output settings
 * @returns {string} The serialized result
 */
function serialize(xml, settings) {
  const doc = new window.DOMParser().parseFromString(xml, "application/xml");
  return serializeResult(doc, { omitXmlDeclaration: "yes", ...settings });
}

describe("XHTML 1.0 documents in xml output", () => {
  const DOCTYPE =
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">\n';

  it("adds the XHTML namespace, the Content-Type meta and XHTML empty elements", () => {
    assert.strictEqual(
      serialize("<html><head/><body><br/><p/></body></html>", {
        ...STRICT,
        method: "xml",
        encoding: "utf-8",
      }),
      `${DOCTYPE}<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8" /></head><body><br /><p></p></body></html>`,
    );
  });

  it("recognises the system identifier alone and keeps an existing meta", () => {
    assert.strictEqual(
      serialize(
        '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="a"/><meta http-equiv="content-type" content="x"/></head></html>',
        {
          doctypeSystem:
            "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd",
        },
      ),
      '<!DOCTYPE html SYSTEM "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n<html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="a" /><meta http-equiv="content-type" content="x" /></head></html>',
    );
  });

  it("only adds the meta to the head of the document element", () => {
    assert.strictEqual(
      serialize("<r><html><head/></html><head/></r>", STRICT),
      '<!DOCTYPE r PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">\n<r><html xmlns="http://www.w3.org/1999/xhtml"><head></head></html><head></head></r>',
    );
  });

  it("adds no namespace to an html element in a namespace or with declarations", () => {
    assert.strictEqual(
      serialize(
        '<r><h:html xmlns:h="urn:h"/><html xmlns:q="urn:q"/></r>',
        STRICT,
      ),
      '<!DOCTYPE r PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">\n<r><h:html xmlns:h="urn:h"/><html xmlns:q="urn:q"></html></r>',
    );
  });

  it("leaves other document types alone", () => {
    assert.strictEqual(
      serialize("<html><head/></html>", {
        method: "xml",
        doctypeSystem: "x.dtd",
      }),
      '<!DOCTYPE html SYSTEM "x.dtd">\n<html><head/></html>',
    );
  });
});

describe("html doctype", () => {
  it("is derived from version when no identifier is declared (general/bug-206)", () => {
    assert.strictEqual(
      htmlDoctypeMarkup({ version: "5" }, "html"),
      "<!DOCTYPE html>",
    );
    assert.strictEqual(
      htmlDoctypeMarkup({ version: "4.01" }, "html"),
      '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/1999/REC-html401-19991224/loose.dtd">',
    );
    assert.strictEqual(
      htmlDoctypeMarkup({ version: "3.2" }, "html"),
      '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 3.2//EN">',
    );
    assert.strictEqual(htmlDoctypeMarkup({ version: "1.0" }, "html"), "");
  });

  it("writes declared identifiers, SYSTEM alone except about:legacy-compat", () => {
    assert.strictEqual(
      htmlDoctypeMarkup({ doctypeSystem: "a.dtd", version: "5" }, "HTML"),
      '<!DOCTYPE HTML SYSTEM "a.dtd">',
    );
    assert.strictEqual(
      htmlDoctypeMarkup({ doctypeSystem: "about:legacy-compat" }, "html"),
      "<!DOCTYPE html>",
    );
  });

  it("is written by the html output method", () => {
    assert.strictEqual(
      serialize("<html/>", { method: "html", version: "5" }),
      "<!DOCTYPE html>\n<html></html>",
    );
  });
});

describe("line breaks between top-level nodes (general/bug-195)", () => {
  const XML = "<!--a--><!--b--><r/><!--c-->";

  it("follow a comment another node follows, unless indent is no", () => {
    assert.strictEqual(serialize(XML, {}), "<!--a-->\n<!--b-->\n<r/><!--c-->");
    assert.strictEqual(
      serialize(XML, { indent: "yes" }),
      "<!--a-->\n<!--b-->\n<r/><!--c-->",
    );
    assert.strictEqual(
      serialize(XML, { indent: "no" }),
      "<!--a--><!--b--><r/><!--c-->",
    );
  });

  it("are not written by the html output method", () => {
    assert.strictEqual(
      serialize("<!--a--><html/>", { method: "html" }),
      "<!--a--><html></html>",
    );
  });
});
