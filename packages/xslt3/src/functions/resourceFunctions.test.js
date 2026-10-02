import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import { code, parse, xp, xs } from "../xpath/testing.test.js";
import { hashSeed, step } from "./random.js";

const xmlParser = (text) => {
  let failed = false;
  const document = new DOMParser({
    onError: (level) => {
      if (level !== "warning") failed = true;
    },
  }).parseFromString(text, "text/xml");
  if (failed) throw new Error("not well-formed");
  return document;
};

describe("fn:parse-xml and fn:parse-xml-fragment", () => {
  const options = { xmlParser, baseUri: "http://x/base" };

  it("parses documents", () => {
    assert.equal(xs("parse-xml('<a>b</a>')/a/string()", null, options), "b");
    assert.equal(
      xs("base-uri(parse-xml('<a/>')), parse-xml(())", null, options),
      "http://x/base",
    );
    assert.equal(code("parse-xml('<a>')", null, options), "FODC0006");
    const failing = {
      xmlParser: () => {
        throw Object.assign(new Error("x"), { code: "FODC0006" });
      },
    };
    assert.equal(code("parse-xml('<a/>')", null, failing), "FODC0006");
  });

  it("parses fragments", () => {
    assert.deepEqual(
      xp("parse-xml-fragment('<a/>t<b/>')/node()", null, options),
      ["<a>", "#text", "<b>"],
    );
    assert.equal(
      xs(
        "parse-xml-fragment(\"<?xml version='1.0' encoding='utf-8'?>x\")",
        null,
        options,
      ),
      "#document-fragment",
    );
    assert.equal(xs("parse-xml-fragment(())", null, options), "");
    assert.equal(
      code("parse-xml-fragment(\"<?xml version='1.0'?><a/>\")", null, options),
      "FODC0006",
    );
  });

  it("uses the global DOMParser by default", () => {
    assert.equal(code("parse-xml('<a/>')"), "FODC0006");
    globalThis.DOMParser = DOMParser;
    try {
      assert.equal(xs("parse-xml('<a/>')/*/name()"), "a");
      assert.equal(code("parse-xml('<a></b>')"), "FODC0006");
      globalThis.DOMParser = class {
        parseFromString() {
          return { getElementsByTagName: () => [{}] };
        }
      };
      assert.equal(code("parse-xml('<a/>')"), "FODC0006");
    } finally {
      delete globalThis.DOMParser;
    }
  });
});

describe("fn:random-number-generator", () => {
  it("is deterministic for a seed", () => {
    assert.equal(hashSeed(""), 0x811c9dc5);
    const [n, next] = step(1);
    assert.ok(n >= 0 && n < 1 && next !== 1);
    assert.equal(
      xs(
        "random-number-generator(1)?number = random-number-generator(1)?number",
      ),
      "true",
    );
    assert.equal(
      xs("random-number-generator()?number = random-number-generator()?number"),
      "true",
    );
    assert.equal(
      xs(
        "let $g := random-number-generator('a') return ($g?next()?number ne $g?number, sort($g?permute(1 to 5)))",
      ),
      "true 1 2 3 4 5",
    );
  });
});

describe("fn:id, fn:element-with-id and fn:idref", () => {
  const doc = parse(
    '<!DOCTYPE r [<!ATTLIST e id ID #IMPLIED ref IDREFS #IMPLIED n CDATA "x">' +
      "<!ATTLIST f to IDREF #REQUIRED>]>" +
      '<r><e id=" a "/><e id="b" ref="a  b"/><g xml:id="c"/><e id="a"/>' +
      '<f to="b"/><h id="d"/></r>',
  );

  it("finds elements by ID", () => {
    assert.deepEqual(xp("id('a b c d')", doc), ["<e>", "<e>", "<g>"]);
    assert.deepEqual(xp("id(('c', 'zz'), /r)", doc), ["<g>"]);
    assert.deepEqual(xp("/r/e[2] ! element-with-id('b')", doc), ["<e>"]);
    assert.deepEqual(xp("id(())", doc), []);
    assert.equal(code("id('a', parse-xml('<a/>')/a/..)", doc), "FODC0006");
    assert.equal(code("id('a')"), "XPDY0002");
  });

  it("reads the DTD declarations once per document", () => {
    const twice = parse(
      "<!DOCTYPE r [<!ATTLIST r k ID #IMPLIED><!ATTLIST r k CDATA #IMPLIED>]>" +
        '<r k="a"/>',
    );
    assert.deepEqual(xp("id('a'), id('a')", twice), ["<r>", "<r>"]);
    assert.deepEqual(xp("id('a')", parse('<r k="a"/>')), []);
  });

  it("finds IDREF attributes", () => {
    assert.deepEqual(xp("idref('b')", doc), ["@ref", "@to"]);
    assert.deepEqual(xp("idref((' a ', '1x'), /r)", doc), ["@ref"]);
    assert.deepEqual(xp("idref('1x')", doc), []);
  });

  it("needs a tree rooted at a document", () => {
    assert.equal(
      code("id('a', $e)", null, {
        variables: { e: doc.createElement("x") },
      }),
      "FODC0001",
    );
    assert.deepEqual(
      xp("id('a', $e)", null, { variables: { e: parse("<x xml:id='a'/>") } }),
      ["<x>"],
    );
  });
});

describe("collections and collation keys", () => {
  const doc = parse("<a/>");
  doc.documentURI = "http://x/a.xml";
  const collections = (uri) =>
    ({ null: [doc], "http://x/c": [doc, doc.documentElement] })[uri];
  const options = { collections, baseUri: "http://x/" };

  it("returns collections and their URIs", () => {
    assert.equal(xs("count(collection())", null, options), "1");
    assert.equal(xs("count(collection('c'))", null, options), "2");
    assert.equal(xs("count(collection(()))", null, options), "1");
    assert.equal(xs("uri-collection('c')", null, options), "http://x/a.xml");
    assert.equal(xs("uri-collection()", null, options), "http://x/a.xml");
    assert.equal(code("collection('none')", null, options), "FODC0002");
    assert.equal(code("collection()"), "FODC0002");
    assert.equal(code("collection('http://[')", null, options), "FODC0004");
    const anyUris = { collections: () => [parse("<b/>"), "urn:u"] };
    assert.equal(xs("uri-collection('urn:c')", null, anyUris), "urn:u");
  });

  it("builds collation keys", () => {
    assert.equal(xs("collation-key('abc')"), "YWJj");
    assert.equal(
      xs(
        "collation-key('ABC', 'http://www.w3.org/2005/xpath-functions/collation/html-ascii-case-insensitive') eq collation-key('abc')",
      ),
      "true",
    );
    assert.equal(
      code("collation-key('a', 'http://www.w3.org/2013/collation/UCA')"),
      "FOCH0002",
    );
  });
});

describe("fn:parse-ietf-date", () => {
  it("parses the HTTP date formats", () => {
    const cases = {
      "Wed, 06 Jun 1994 07:29:35 GMT": "1994-06-06T07:29:35Z",
      "Wed Jun 06 11:54:45 EST 2013": "2013-06-06T11:54:45-05:00",
      "Sunday, 06-Nov-94 08:49:37 GMT": "1994-11-06T08:49:37Z",
      "Wed, 6 Jun 94 07:29:35 +0500": "1994-06-06T07:29:35+05:00",
      "Feb-02 02:02-02: 02": "1902-02-02T02:02:00-02:00",
      "Aug 20 4:36:01 -500 2014": "2014-08-20T04:36:01-05:00",
      "Aug 20 4:36:01 -5 2014": "2014-08-20T04:36:01-05:00",
      " Aug 20 24:00 2014 ": "2014-08-21T00:00:00Z",
      "Tue, 9 Sep 2014 19:36:01.25 -05:00 (EST)":
        "2014-09-09T19:36:01.25-05:00",
    };
    for (const [text, expected] of Object.entries(cases)) {
      assert.equal(xs(`parse-ietf-date('${text}')`), expected, text);
    }
    assert.equal(xs("parse-ietf-date(())"), "");
  });

  it("raises FORG0010", () => {
    for (const text of [
      "2014-08-20T19:36:01Z",
      "Wed,20 Aug 2014 19:36:01",
      "Aug 20 19:36:01 -05:0 2014",
      "Sat, 29 Feb 2014 19:36:01 GMT",
      "Aug 20 19:36:01 CET 2014",
    ]) {
      assert.equal(code(`parse-ietf-date('${text}')`), "FORG0010", text);
    }
  });
});
