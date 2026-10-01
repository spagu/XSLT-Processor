import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import { serialize } from "../index.js";

const XHTML = 'xmlns="http://www.w3.org/1999/xhtml"';
const out = (text, params) =>
  serialize([new DOMParser().parseFromString(text, "text/xml")], {
    omitXmlDeclaration: true,
    includeContentType: false,
    ...params,
  });
const xhtml = (text, version = 5, params = {}) =>
  out(text, { method: "xhtml", htmlVersion: version, ...params });

describe("the xhtml output method", () => {
  it("writes empty elements by their content model", () => {
    assert.equal(
      xhtml(`<html ${XHTML}><br/><frame/></html>`, 4),
      `<html ${XHTML}><br /><frame /></html>`,
    );
    assert.equal(
      xhtml("<html><br/><p/></html>", 4),
      "<html><br></br><p></p></html>",
    );
    assert.equal(
      xhtml("<html><br/><frame/></html>"),
      "<!DOCTYPE html>\n<html><br /><frame></frame></html>",
    );
  });

  it("writes HTML5 namespaces without prefixes", () => {
    const text =
      '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:body><s:svg xmlns:s="http://www.w3.org/2000/svg"><s:rect/></s:svg></h:body></h:html>';
    assert.equal(
      xhtml(text),
      `<!DOCTYPE html>\n<html ${XHTML}><body><svg xmlns="http://www.w3.org/2000/svg"><rect></rect></svg></body></html>`,
    );
  });

  it("writes CDATA sections, URIs and attributes", () => {
    assert.equal(
      xhtml(
        '<p xmlns:h="http://www.w3.org/1999/xhtml"><b>Y</b><h:em>Y</h:em><a href="é" checked="checked"/></p>',
        4,
        {
          cdataSectionElements: "b Q{http://www.w3.org/1999/xhtml}em",
        },
      ),
      '<p xmlns:h="http://www.w3.org/1999/xhtml"><b><![CDATA[Y]]></b><h:em><![CDATA[Y]]></h:em><a href="é" checked="checked"></a></p>',
    );
  });

  it("writes document type declarations and the content type", () => {
    assert.equal(xhtml("<html/>", 4, { doctypePublic: "p" }), "<html></html>");
    assert.equal(
      xhtml("<html/>", 5, { doctypePublic: "p" }),
      "<!DOCTYPE html>\n<html></html>",
    );
    assert.equal(
      xhtml("<html/>", 5, { doctypeSystem: "about:legacy-compat" }),
      '<!DOCTYPE html SYSTEM "about:legacy-compat">\n<html></html>',
    );
    assert.equal(
      xhtml("<html><head/></html>", 5, { includeContentType: true }),
      '<!DOCTYPE html>\n<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /></head></html>',
    );
    assert.equal(
      xhtml("<html><head/></html>", 4, { includeContentType: true }),
      "<html><head></head></html>",
    );
  });

  it("does not indent around inline elements", () => {
    assert.equal(
      xhtml("<p>a<mark>t</mark>z</p>", 5, { indent: true }),
      "<p>a<mark>t</mark>z</p>",
    );
  });
});
