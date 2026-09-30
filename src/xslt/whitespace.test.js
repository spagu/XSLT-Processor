/**
 * `xsl:strip-space` / `xsl:preserve-space` tests.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { JSDOM } from "jsdom";
import { WhitespaceFilter, stripWhitespaceNodes } from "./whitespace.js";
import {
  compileSpaceNameTests,
  matchesNameTest,
  nameTestPriority,
} from "./spaceNameTests.js";

let dom;

function parseXML(xmlString) {
  return new dom.window.DOMParser().parseFromString(
    xmlString,
    "application/xml",
  );
}

function emptyDocument() {
  return dom.window.document.implementation.createDocument(null, null, null);
}

describe("WhitespaceFilter", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should be inactive without xsl:strip-space", () => {
    assert.strictEqual(new WhitespaceFilter([], ["p"]).isActive(), false);
    assert.strictEqual(new WhitespaceFilter(["*"]).isActive(), true);
  });

  it("should strip elements matched by a wildcard", () => {
    const doc = parseXML("<root><item/></root>");
    const filter = new WhitespaceFilter(["*"]);

    assert.strictEqual(filter.isStripped(doc.documentElement), true);
  });

  it("should not strip elements that were never named", () => {
    const doc = parseXML("<root><item/></root>");
    const filter = new WhitespaceFilter(["other"]);

    assert.strictEqual(filter.isStripped(doc.documentElement), false);
  });

  it("should let preserve-space win at equal specificity", () => {
    const doc = parseXML("<root/>");
    const filter = new WhitespaceFilter(["*"], ["*"]);

    assert.strictEqual(filter.isStripped(doc.documentElement), false);
  });

  it("should let the most specific name test win", () => {
    const doc = parseXML("<root/>");

    assert.strictEqual(
      new WhitespaceFilter(["root"], ["*"]).isStripped(
        parseXML("<root/>").documentElement,
      ),
      true,
    );
    assert.strictEqual(
      new WhitespaceFilter(["*"], ["root"]).isStripped(doc.documentElement),
      false,
    );
  });

  it("should match namespace wildcards", () => {
    const doc = parseXML('<a:root xmlns:a="urn:a"><a:item/></a:root>');
    const filter = new WhitespaceFilter(["a:*"]);

    assert.strictEqual(filter.isStripped(doc.documentElement), true);
    assert.strictEqual(
      new WhitespaceFilter(["b:*"]).isStripped(doc.documentElement),
      false,
    );
  });
});

describe("stripWhitespaceNodes", () => {
  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      contentType: "text/html",
    });
  });

  it("should remove whitespace-only text nodes from a document", () => {
    const doc = parseXML(
      "<root>\n  <item>  </item>\n  <item>x</item>\n</root>",
    );
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.nodeType, 9);
    assert.strictEqual(stripped.documentElement.childNodes.length, 2);
    assert.strictEqual(
      stripped.documentElement.firstChild.childNodes.length,
      0,
    );
    assert.strictEqual(doc.documentElement.childNodes.length, 5);
  });

  it("should keep whitespace under xml:space=preserve", () => {
    const doc = parseXML('<root xml:space="preserve">\n  <item/>\n</root>');
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.documentElement.childNodes.length, 3);
  });

  it("should honour xml:space=default on a nested element", () => {
    const doc = parseXML(
      '<root xml:space="preserve"><item xml:space="default">\n  <sub/>\n</item></root>',
    );
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(
      stripped.documentElement.firstChild.childNodes.length,
      1,
    );
  });

  it("should keep non whitespace text and CDATA content", () => {
    const doc = parseXML("<root>  <item><![CDATA[  ]]></item> keep </root>");
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.documentElement.childNodes.length, 2);
    assert.strictEqual(
      stripped.documentElement.firstChild.childNodes.length,
      0,
    );
  });

  it("should strip an element source node", () => {
    const doc = parseXML("<root>\n  <item/>\n</root>");
    const stripped = stripWhitespaceNodes(
      doc.documentElement,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.nodeType, 1);
    assert.strictEqual(stripped.childNodes.length, 1);
  });

  it("should skip a document type declaration", () => {
    const doc = new dom.window.DOMParser().parseFromString(
      "<!DOCTYPE root><root>\n  <item/>\n</root>",
      "application/xml",
    );
    const stripped = stripWhitespaceNodes(
      doc,
      new WhitespaceFilter(["*"]),
      emptyDocument(),
    );

    assert.strictEqual(stripped.documentElement.childNodes.length, 1);
  });
});

describe("expanded name tests (libxslt bug-82, bug-124)", () => {
  beforeEach(() => {
    dom = new JSDOM("");
  });

  it("expands prefixes with the declaring element and matches by namespace", () => {
    const declaration = parseXML(
      '<s xmlns:m="urn:m" xmlns="urn:default" elements="m:* p * q:x 1a"/>',
    ).documentElement;
    const warnings = [];
    const tests = compileSpaceNameTests(
      declaration.getAttribute("elements"),
      declaration,
      (message) => warnings.push(message),
    );
    assert.deepStrictEqual(tests, [
      { namespaceUri: "urn:m", localName: "*" },
      { namespaceUri: null, localName: "p" },
      { namespaceUri: undefined, localName: "*" },
    ]);
    assert.deepStrictEqual(warnings, [
      'xsl:s elements: "q:x" is not a name test with a declared prefix and is ignored',
      'xsl:s elements: "1a" is not a name test with a declared prefix and is ignored',
    ]);
    assert.deepStrictEqual(compileSpaceNameTests(null, declaration, null), []);

    const doc = parseXML('<p><x:a xmlns:x="urn:m"/><p xmlns="urn:o"/></p>');
    const [inM, inO] = doc.documentElement.childNodes;
    assert.strictEqual(matchesNameTest(inM, tests[0]), true);
    assert.strictEqual(matchesNameTest(inO, tests[0]), false);
    assert.strictEqual(matchesNameTest(doc.documentElement, tests[1]), true);
    assert.strictEqual(matchesNameTest(inO, tests[1]), false);
    assert.strictEqual(matchesNameTest(inO, tests[2]), true);
    assert.deepStrictEqual(tests.map(nameTestPriority), [-0.25, 0, -0.5]);
  });

  it("strips by expanded name, preserve-space winning ties", () => {
    const doc = parseXML(
      '<r><c> <p/> </c><c xmlns="urn:n"> <p/> </c><m:c xmlns:m="urn:n"> </m:c></r>',
    );
    const filter = new WhitespaceFilter(
      [
        { namespaceUri: null, localName: "c" },
        { namespaceUri: "urn:n", localName: "*" },
      ],
      [{ namespaceUri: undefined, localName: "*" }],
    );
    const stripped = stripWhitespaceNodes(doc, filter, emptyDocument());
    const counts = Array.from(
      stripped.documentElement.childNodes,
      (child) => child.childNodes.length,
    );
    assert.deepStrictEqual(counts, [1, 1, 0]);
  });
});
