import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMImplementation, DOMParser } from "@xmldom/xmldom";
import { serialize, serializeChunks } from "../index.js";

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

describe("indentation", () => {
  const doc =
    "<doc>\n <title>T</title><p>A <code>c</code></p><!--c--><e> </e><x/></doc>";

  it("indents element-only content", () => {
    assert.equal(
      xml(doc, { indent: true }),
      "<doc>\n  <title>T</title>\n  <p>A <code>c</code></p>\n  <!--c-->\n  <e> </e>\n  <x/>\n</doc>",
    );
  });

  it("keeps xml:space='preserve' and suppress-indentation content", () => {
    assert.equal(
      xml(
        '<a xml:space="preserve"><b><c/></b><d xml:space="default"><e/></d></a>',
        { indent: true },
      ),
      '<a xml:space="preserve"><b><c/></b><d xml:space="default">\n    <e/>\n  </d></a>',
    );
    assert.equal(
      xml("<a><b><c/></b></a>", { indent: true, suppressIndentation: "b" }),
      "<a>\n  <b><c/></b>\n</a>",
    );
  });

  it("separates top-level nodes", () => {
    assert.equal(xml("<!--c--><a/>", { indent: true }), "<!--c-->\n<a/>");
  });
});

describe("streaming", () => {
  it("writes deep trees in chunks", () => {
    const doc = new DOMImplementation().createDocument(null, "r", null);
    let parent = doc.documentElement;
    for (let i = 0; i < 50000; i++) {
      const child = doc.createElement("e");
      parent.appendChild(child);
      parent = child;
    }
    parent.appendChild(doc.createTextNode("x"));
    const chunks = [
      ...serializeChunks(
        [doc],
        { omitXmlDeclaration: true },
        { chunkSize: 1000 },
      ),
    ];
    assert.ok(chunks.length > 100);
    const output = chunks.join("");
    assert.equal(
      output.length,
      "<r></r>".length + 50000 * "<e></e>".length + 1,
    );
    assert.equal(output.slice(0, 10), "<r><e><e><");
    assert.equal(serialize(doc, { method: "text" }), "x");
  });

  it("reports parameter errors at once", () => {
    assert.equal(
      code(() => serializeChunks([], { indent: "maybe" })),
      "SEPM0016",
    );
  });
});
