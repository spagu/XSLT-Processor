import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import { evaluateXPath } from "../../xpath/index.js";
import { parametersFromElement } from "./fromElement.js";
import { parametersFromMap } from "./fromMap.js";
import { normalizeSettings } from "./settings.js";

const OUTPUT =
  'xmlns:output="http://www.w3.org/2010/xslt-xquery-serialization"';
const element = (content, attributes = "") =>
  new DOMParser().parseFromString(
    `<output:serialization-parameters ${OUTPUT} ${attributes}>${content}</output:serialization-parameters>`,
    "text/xml",
  ).documentElement;
const fromMap = (expr) => parametersFromMap(evaluateXPath(expr)[0]);
const code = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.code;
  }
};

describe("parameters as an element", () => {
  it("reads parameters, names and character maps", () => {
    const params = parametersFromElement(
      element(
        '<output:method value=" html "/><output:indent value="yes"/>' +
          '<output:cdata-section-elements value="p:a b"/>' +
          '<output:use-character-maps><output:character-map character="$" map-string="£"/></output:use-character-maps>' +
          '<v:x xmlns:v="urn:v" value="1"/>text',
        'xmlns:p="urn:p"',
      ),
    );
    assert.equal(params.method, "html");
    assert.equal(params.indent, true);
    assert.deepEqual(
      [...params["cdata-section-elements"]],
      ["{urn:p}a", "{}b"],
    );
    assert.equal(params["use-character-maps"].get("$"), "£");
  });

  it("reports invalid elements", () => {
    const wrong = new DOMParser().parseFromString("<x/>", "text/xml");
    assert.equal(
      code(() => parametersFromElement(wrong)),
      "XPTY0004",
    );
    assert.equal(
      code(() => parametersFromElement(wrong.documentElement)),
      "XPTY0004",
    );
    const cases = [
      ["", 'a="1"', "SEPM0017"],
      ['<output:indent value="yes" b="1"/>', "", "SEPM0017"],
      ["<output:indent/>", "", "SEPM0017"],
      ['<output:outdent value="yes"/>', "", "SEPM0017"],
      ['<indent value="yes"/>', "", "SEPM0017"],
      ['<output:indent value="maybe"/>', "", "SEPM0017"],
      ['<output:use-character-maps value="yes"/>', "", "SEPM0017"],
      [
        '<output:use-character-maps><output:map character="a" map-string="b"/></output:use-character-maps>',
        "",
        "SEPM0017",
      ],
      [
        '<output:use-character-maps><output:character-map character="ab" map-string="b"/></output:use-character-maps>',
        "",
        "SEPM0017",
      ],
      [
        '<output:use-character-maps><output:character-map character="a" map-string="b"/><output:character-map character="a" map-string="c"/></output:use-character-maps>',
        "",
        "SEPM0018",
      ],
      [
        '<output:indent value="yes"/><output:indent value="no"/>',
        "",
        "SEPM0019",
      ],
      ['<v:x xmlns:v="urn:v"/><v:x xmlns:v="urn:v"/>', "", "SEPM0019"],
    ];
    for (const [content, attributes, expected] of cases) {
      assert.equal(
        code(() => parametersFromElement(element(content, attributes))),
        expected,
        content,
      );
    }
  });
});

describe("parameters as a map", () => {
  it("converts values with the function conversion rules", () => {
    const params = fromMap(
      "map { 'indent': xs:untypedAtomic('true'), 'method': 'json', " +
        "'html-version': 5, 'standalone': (), 'encoding': xs:anyURI('UTF-8'), " +
        "'cdata-section-elements': [QName('urn:p', 'a')], 'item-separator': xs:untypedAtomic('|'), " +
        "'json-node-output-method': QName('', 'text'), 'use-character-maps': map { '$': '£' }, " +
        "'doctype-system': (), QName('urn:v', 'x'): 1, 'other': 1, 1: 2 }",
    );
    assert.equal(params.indent, true);
    assert.equal(params.method, "json");
    assert.equal(
      params["html-version"].toNumber?.() ?? Number(params["html-version"]),
      5,
    );
    assert.equal(params.standalone, null);
    assert.equal(params.encoding, "UTF-8");
    assert.equal(params["cdata-section-elements"][0].localName, "a");
    assert.equal(params["item-separator"], "|");
    assert.equal(params["json-node-output-method"].localName, "text");
    assert.equal(params["use-character-maps"].get("$"), "£");
    assert.equal("doctype-system" in params, false);
    assert.equal(normalizeSettings(params).jsonNodeOutputMethod, "text");
  });

  it("rejects values of the wrong type", () => {
    const cases = [
      "map { 'indent': 'yes' }",
      "map { 'indent': (true(), false()) }",
      "map { 'indent': xs:untypedAtomic('maybe') }",
      "map { 'html-version': 5e0 }",
      "map { 'cdata-section-elements': 'p' }",
      "map { 'cdata-section-elements': xs:untypedAtomic('p') }",
      "map { 'use-character-maps': true() }",
      "map { 'use-character-maps': map { QName('', 'a'): 'b' } }",
      "map { 'use-character-maps': map { 'a': xs:untypedAtomic('b') } }",
      "map { 'use-character-maps': map { 'a': ('b', 'c') } }",
    ];
    for (const expr of cases) {
      assert.equal(
        code(() => fromMap(expr)),
        "XPTY0004",
        expr,
      );
    }
    assert.deepEqual(fromMap("map { 'use-character-maps': () }"), {});
  });
});
