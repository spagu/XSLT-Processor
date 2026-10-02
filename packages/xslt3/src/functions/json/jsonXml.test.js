import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
import { evaluateXPath } from "../../xpath/index.js";
import { code, parse, xs } from "../../xpath/testing.test.js";

const FN = "http://www.w3.org/2005/xpath-functions";
const options = {
  createDocument: () => new DOMImplementation().createDocument(null, null),
  baseUri: "http://example.com/base/",
};

/** Serializes the document json-to-xml returns, without namespaces. */
function toXml(expr) {
  const [document] = evaluateXPath(expr, null, options);
  return new XMLSerializer()
    .serializeToString(document)
    .replace(` xmlns="${FN}"`, "");
}

/** Parses XML whose document element is put in the fn namespace. */
const fnDoc = (xml) => parse(xml.replace(/^<([\w-]+)/, `<$1 xmlns="${FN}"`));

/** xml-to-json of an XML text in the fn namespace. */
const toJson = (xml, opts = "map{}") =>
  xs(`xml-to-json(., ${opts})`, fnDoc(xml));

describe("fn:json-to-xml", () => {
  it("builds the XML representation", () => {
    assert.equal(
      toXml(`json-to-xml('{"a":[1, "x", true, null, {}]}')`),
      '<map><array key="a"><number>1</number><string>x</string>' +
        "<boolean>true</boolean><null/><map/></array></map>",
    );
    assert.equal(toXml(`json-to-xml('""')`), "<string/>");
    assert.equal(xs("json-to-xml(()), json-to-xml((), map{})"), "");
    assert.equal(
      xs("base-uri(json-to-xml('1'))", null, options),
      "http://example.com/base/",
    );
  });

  it("handles duplicate keys", () => {
    const json = `'{"a":1,"a":2}'`;
    assert.equal(
      toXml(`json-to-xml(${json})`),
      '<map><number key="a">1</number><number key="a">2</number></map>',
    );
    assert.equal(
      toXml(`json-to-xml(${json}, map{'duplicates':'use-first'})`),
      '<map><number key="a">1</number></map>',
    );
    assert.equal(
      code(`json-to-xml(${json}, map{'duplicates':'reject'})`, null, options),
      "FOJS0003",
    );
    assert.equal(
      code(`json-to-xml(${json}, map{'duplicates':'use-last'})`, null, options),
      "FOJS0005",
    );
  });

  it("marks escaped strings and keys", () => {
    assert.equal(
      toXml(
        `json-to-xml('{"a\\tb":"\\u0001", "c":"d"}', map{'escape':true()})`,
      ),
      '<map><string escaped="true" key="a\\tb" escaped-key="true">\\u0001</string>' +
        '<string key="c">d</string></map>',
    );
    assert.equal(
      code("json-to-xml('1', map{'validate':true()})", null, options),
      "FOJS0004",
    );
  });
});

describe("fn:xml-to-json", () => {
  it("writes JSON", () => {
    assert.equal(
      toJson(
        '<map><array key="a"><number>1.0e0</number><string>x/"</string>' +
          "<boolean> 1 </boolean><null/><!--c--></array>" +
          '<string key="k&#9;">a&#10;</string></map>',
      ),
      '{"a":[1,"x\\/\\"",true,null],"k\\t":"a\\n"}',
    );
    assert.equal(toJson("<number>-0</number>"), "-0");
    assert.equal(toJson("<number>1e6</number>"), "1.0E6");
    assert.equal(toJson("<array> </array>"), "[]");
    assert.equal(xs("xml-to-json(()), xml-to-json((), map{})"), "");
    // a document fragment (a temporary tree) is a document node
    const fragment = fnDoc("<string>a</string>").createDocumentFragment();
    fragment.appendChild(fnDoc("<string>a</string>").documentElement);
    assert.equal(xs("xml-to-json(.)", fragment), '"a"');
    const doc = parse(`<!--x--><null xmlns="${FN}"/>`);
    assert.equal(xs("xml-to-json(.)", doc), "null");
  });

  it("keeps escaped strings and keys", () => {
    assert.equal(
      toJson('<string escaped="true">\\u00e9"\\/&#9;</string>'),
      '"\\u00e9\\"\\/\\t"',
    );
    assert.equal(
      toJson(
        '<map><null key="\\t" escaped-key="1"/><null key="\\\\t" escaped-key="1"/></map>',
      ),
      '{"\\t":null,"\\\\t":null}',
    );
    assert.equal(toJson('<string escaped="false">\\t</string>'), '"\\\\t"');
    assert.equal(
      code(
        "xml-to-json(.)",
        parse(`<string xmlns="${FN}" escaped="true">\\q</string>`),
      ),
      "FOJS0007",
    );
  });

  it("indents", () => {
    assert.equal(
      toJson(
        '<map><array key="a"><null/></array></map>',
        "map{'indent':true()}",
      ),
      '{\n  "a": [\n    null\n  ]\n}',
    );
    assert.equal(
      code("xml-to-json(., map{'indent':()})", parse(`<null xmlns="${FN}"/>`)),
      "XPTY0004",
    );
  });

  it("rejects invalid representations (FOJS0006)", () => {
    for (const xml of [
      "<map><null/></map>",
      '<map><null key="a"/><null key="a"/></map>',
      "<map>x<null/></map>",
      "<string>a<b/></string>",
      "<number>INF</number>",
      "<number>x</number>",
      "<boolean>maybe</boolean>",
      "<null>x</null>",
      "<date/>",
      '<number zero="yes">0</number>',
      '<null escaped="true"/>',
      '<string escaped="no">x</string>',
      `<null xmlns:f="${FN}" f:key="a"/>`,
    ]) {
      assert.equal(code("xml-to-json(.)", fnDoc(xml)), "FOJS0006", xml);
    }
    assert.equal(code("xml-to-json(.)", parse("<null/>")), "FOJS0006");
    assert.equal(
      code("xml-to-json(.)", parse("<a>t</a>").documentElement.firstChild),
      "FOJS0006",
    );
    const fragment = parse(`<r xmlns="${FN}"><null/><null/></r>`);
    const twoElements = fragment.createDocumentFragment();
    for (const child of [...fragment.documentElement.childNodes]) {
      twoElements.appendChild(child);
    }
    assert.equal(code("xml-to-json(.)", twoElements), "FOJS0006");
    assert.equal(
      xs(
        `xml-to-json(.)`,
        parse(
          `<string xmlns="${FN}" key="k" xmlns:o="urn:o" o:x="1">v</string>`,
        ),
      ),
      '"v"',
    );
  });
});
