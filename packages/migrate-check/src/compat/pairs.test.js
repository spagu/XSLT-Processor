import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoverPairs, parsePairsJson, parseParams } from "./pairs.js";
import { SAMPLE_PROJECT } from "../../test/sample.js";

const files = (project) =>
  Object.entries(project).map(([path, text]) => ({ path, text }));

describe("discoverPairs", () => {
  it("finds the three documents of the sample project", () => {
    assert.deepEqual(
      discoverPairs(files(SAMPLE_PROJECT)).map((p) => [p.xml, p.xsl, p.skip]),
      [
        ["public/invoice.xml", "styles/invoice.xsl", null],
        ["public/orders.xml", "styles/orders.xsl", null],
        ["public/catalog.xml", "styles/catalog.xsl", null],
      ],
    );
  });

  it("marks remote and missing stylesheets, ignores the rest", () => {
    const pi = (href) =>
      `<?xml-stylesheet type="text/xsl" href="${href}"?><r/>`;
    const pairs = discoverPairs([
      { path: "a.xml", text: pi("https://x/a.xsl") },
      { path: "b.xml", text: pi("gone.xsl") },
      { path: "c.xml", text: "<r/>" },
      { path: "d.xml", text: null },
      { path: "e.txt", text: pi("x.xsl") },
      { path: "s.xml", text: '<xsl:stylesheet version="1.0">' },
    ]);
    assert.deepEqual(
      pairs.map((p) => [p.xml, p.xsl, p.skip]),
      [
        ["a.xml", "https://x/a.xsl", "the stylesheet is a URL or missing"],
        ["b.xml", "gone.xsl", "stylesheet not found in the project"],
      ],
    );
  });
});

describe("parsePairsJson", () => {
  it("reads the list with string parameters", () => {
    assert.deepEqual(
      parsePairsJson(
        '[{"xml":"a.xml","xsl":"a.xsl","params":{"n":1,"s":"x"}},{"xml":"b.xml","xsl":"b.xsl"}]',
      ),
      [
        { xml: "a.xml", xsl: "a.xsl", params: { n: "1", s: "x" }, skip: null },
        { xml: "b.xml", xsl: "b.xsl", params: {}, skip: null },
      ],
    );
  });

  it("names the problem", () => {
    const fails = (text, pattern) =>
      assert.throws(() => parsePairsJson(text), pattern);
    fails("{", /^Error: not valid JSON/);
    fails("{}", /expected an array of pairs/);
    fails("[null]", /entry 1: "xml" and "xsl" must be strings/);
    fails(
      '[{"xml":"a","xsl":"b","params":[]}]',
      /entry 1: "params" must be an object/,
    );
    fails(
      '[{"xml":"a","xsl":"b","params":null}]',
      /"params" must be an object/,
    );
    fails(
      '[{"xml":"a","xsl":"b","params":{"p":{}}}]',
      /parameter "p" must be a string or number/,
    );
    fails('[{"xml":"a","xsl":"b","params":{"p":null}}]', /parameter "p"/);
  });
});

describe("parseParams", () => {
  it("splits name=value at the first =", () => {
    assert.deepEqual(parseParams(["a=1", "b=x=y", "c="]), {
      a: "1",
      b: "x=y",
      c: "",
    });
    assert.throws(() => parseParams(["=1"]), /--param needs name=value/);
    assert.throws(() => parseParams(["a"]), /got "a"/);
  });
});
