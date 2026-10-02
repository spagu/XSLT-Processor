import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { renderTestHtml } from "./html.js";

const results = [
  { xml: "a.xml", xsl: "a.xsl", params: {}, status: "MATCH" },
  {
    xml: "b.xml",
    xsl: "b.xsl",
    params: {},
    status: "DIFFERENT",
    path: "/r",
    expected: "<r>1</r>",
    actual: "<r>2</r>",
  },
  {
    xml: "c.xml",
    xsl: "c.xsl",
    params: {},
    status: "ERROR",
    engine: "Tradik",
    message: "<boom>",
  },
  {
    xml: "d.xml",
    xsl: "d.xsl",
    params: {},
    status: "SKIPPED",
    reason: "not found",
  },
];

describe("renderTestHtml", () => {
  it("renders the counts and one row per transformation", () => {
    const html = renderTestHtml(results, {
      version: "0.3.0",
      reference: "xsltproc",
      generatedAt: new Date("2026-10-02T10:00:00Z"),
    });
    const { document } = new JSDOM(html).window;
    assert.equal(document.title, "XSLT compatibility test");
    assert.match(
      document.querySelector('meta[name="description"]').content,
      /33\.3% of 4 transformations match xsltproc/,
    );
    assert.equal(document.querySelectorAll(".findings tbody tr").length, 4);
    assert.ok(html.includes("&lt;boom&gt;"));
    assert.ok(html.includes("<pre><code>&lt;r&gt;1&lt;/r&gt;</code></pre>"));
    assert.ok(html.includes("2026-10-02 10:00 UTC"));
    assert.ok(
      html.includes(
        '<meta name="generator" content="xslt-migrate-check 0.3.0">',
      ),
    );
  });

  it("shows n/a without comparisons", () => {
    assert.ok(
      renderTestHtml([], { version: "0", reference: "none" }).includes(
        "<td>n/a</td>",
      ),
    );
  });
});
