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
const html = (text, version = 5, params = {}) =>
  out(text, { method: "html", htmlVersion: version, ...params });
const code = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
};

describe("the html output method", () => {
  it("writes void elements without end tags", () => {
    assert.equal(
      html("<html><body><br/><frame/><p/></body></html>", 4),
      "<html><body><br><frame><p></p></body></html>",
    );
    assert.equal(
      html("<html><body><wbr/><frame/></body></html>"),
      "<!DOCTYPE html>\n<html><body><wbr><frame></frame></body></html>",
    );
  });

  it("knows which elements are HTML elements", () => {
    assert.equal(
      html(`<html ${XHTML}><br/></html>`, 4),
      `<html ${XHTML}><br/></html>`,
    );
    assert.equal(
      html(`<html ${XHTML}><br/></html>`),
      `<!DOCTYPE html>\n<html ${XHTML}><br></html>`,
    );
    assert.equal(
      html('<div><magic xmlns="urn:m"/></div>'),
      '<div><magic xmlns="urn:m"/></div>',
    );
    assert.equal(
      html('<p xmlns:h="http://www.w3.org/1999/xhtml"><h:b>x</h:b></p>'),
      `<p><b ${XHTML}>x</b></p>`,
    );
  });

  it("writes script and style content unescaped", () => {
    assert.equal(
      html('<SCRIPT a="J&amp;J">a &amp;&amp; b("&lt;p&gt;")</SCRIPT>'),
      '<SCRIPT a="J&amp;J">a && b("<p>")</SCRIPT>',
    );
    assert.equal(
      html('<p class="&amp;{x}">&amp;</p>'),
      '<p class="&{x}">&amp;</p>',
    );
  });

  it("minimizes boolean attributes and escapes URIs", () => {
    assert.equal(
      html(
        '<select><option selected="SELECTED"/><option selected="no"/></select>',
        4,
      ),
      '<select><option selected></option><option selected="no"></option></select>',
    );
    const link = '<a href="file:///My Docs/bébé.xml" name="é" title="é">x</a>';
    assert.equal(
      html(link),
      '<a href="file:///My Docs/b%C3%A9b%C3%A9.xml" name="%C3%A9" title="é">x</a>',
    );
    assert.equal(html(link, 5, { escapeUriAttributes: false }), link);
    // the URI is normalized to NFC before it is escaped
    assert.equal(html('<a href="a\u030A"/>', 5), '<a href="%C3%A5"></a>');
  });

  it("writes processing instructions and checks characters", () => {
    assert.equal(html("<p><?pi data?></p>"), "<p><?pi data></p>");
    assert.equal(html("<p><?pi?></p>"), "<p><?pi></p>");
    assert.equal(
      code(() => html("<p><?pi a>b?></p>")),
      "SERE0015",
    );
    const doc = new DOMParser().parseFromString("<p/>", "text/xml");
    doc.documentElement.appendChild(doc.createTextNode("\u0085"));
    assert.equal(
      code(() => serialize([doc], { method: "html" })),
      "SERE0014",
    );
  });

  it("writes CDATA sections only in non-HTML elements", () => {
    assert.equal(
      html('<p xmlns:ex="urn:ex">a<ex:i>b</ex:i></p>', 4, {
        cdataSectionElements: "p Q{urn:ex}i",
      }),
      '<p xmlns:ex="urn:ex">a<ex:i><![CDATA[b]]></ex:i></p>',
    );
  });

  it("writes document type declarations", () => {
    assert.equal(html("<html/>", 4), "<html></html>");
    assert.equal(
      html("<html/>", 4, { doctypePublic: "p" }),
      '<!DOCTYPE html PUBLIC "p">\n<html></html>',
    );
    assert.equal(
      html("<html/>", 4, { doctypeSystem: "s" }),
      '<!DOCTYPE html SYSTEM "s">\n<html></html>',
    );
    assert.equal(
      html("<html/>", 5, { doctypeSystem: "s", doctypePublic: "p" }),
      '<!DOCTYPE html PUBLIC "p" "s">\n<html></html>',
    );
    assert.equal(html("<foo/>"), "<foo></foo>");
    assert.equal(html("<HTML/>"), "<!DOCTYPE html>\n<HTML></HTML>");
  });

  it("adds the content type", () => {
    const params = { includeContentType: true };
    assert.equal(
      html(
        '<html><head><meta http-equiv="Content-Type" content="x"/><meta name="a"/></head></html>',
        4,
        params,
      ),
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="a"></head></html>',
    );
    assert.equal(
      html("<html><head><title/></head></html>", 4, {
        ...params,
        indent: true,
      }).includes("<head>\n    <meta"),
      true,
    );
    assert.equal(html("<html/>", 4, params), "<html></html>");
  });

  it("indents block content only", () => {
    const params = { indent: true };
    assert.equal(
      html(
        "<html><body><div><p>one</p><p>a<b>t</b>z</p></div><p><b>x</b><i>y</i></p><pre><b/></pre></body></html>",
        4,
        params,
      ),
      "<html>\n  <body>\n    <div>\n      <p>one</p>\n      <p>a<b>t</b>z</p>\n    </div>\n" +
        "    <p><b>x</b><i>y</i></p>\n    <pre><b></b></pre>\n  </body>\n</html>",
    );
    assert.equal(
      html("<body><TABLE><tr><td/></tr></TABLE></body>", 4, {
        ...params,
        suppressIndentation: "table",
      }),
      "<body>\n  <TABLE><tr><td></td></tr></TABLE>\n</body>",
    );
  });
});
