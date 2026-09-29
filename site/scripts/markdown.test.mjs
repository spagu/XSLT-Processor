import { describe as suite, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyLines,
  describe,
  escapeHtml,
  firstHeading,
  firstParagraph,
  frontmatter,
  inlineHtml,
  leadList,
  linkRewriter,
  linkTable,
  mapLinks,
  plainText,
  relativeUrl,
  sections,
  stripTitle,
  subsections,
  truncate,
} from "./markdown.mjs";

const doc = `# Title

Intro with **bold** and \`code\`.

\`\`\`md
## Not a section
- **Not**: an item
\`\`\`

## First

Body one.

### Sub A

Text A.

## Second

Body two.
`;

suite("classifyLines", () => {
  it("marks fenced code including the fences", () => {
    const flags = classifyLines("a\n```js\nb\n```\nc").map((l) => l.code);
    assert.deepEqual(flags, [false, true, true, true, false]);
  });

  it("only closes a fence with the same marker", () => {
    const flags = classifyLines("~~~\n```\n~~~\nx").map((l) => l.code);
    assert.deepEqual(flags, [true, true, true, false]);
  });
});

suite("headings and sections", () => {
  it("finds the first level-one heading outside code", () => {
    assert.equal(firstHeading("```\n# no\n```\n# Yes #"), "Yes");
    assert.equal(firstHeading("no heading"), null);
  });

  it("strips the title line", () => {
    assert.equal(stripTitle("# T\n\nText"), "Text");
    assert.equal(stripTitle("Text"), "Text");
  });

  it("splits level-two sections and ignores headings in code", () => {
    const parts = sections(doc);
    assert.deepEqual([...parts.keys()], ["First", "Second"]);
    assert.match(parts.get("First"), /### Sub A/);
    assert.equal(parts.get("Second"), "Body two.");
  });

  it("splits level-three subsections", () => {
    assert.equal(
      subsections(sections(doc).get("First")).get("Sub A"),
      "Text A.",
    );
  });
});

suite("plain text and descriptions", () => {
  it("removes inline markup", () => {
    assert.equal(
      plainText("**B** _i_ `c` [l](u) ![a](i.png) <b>x</b>"),
      "B i c l a x",
    );
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const text = "word ".repeat(50).trim();
    const short = truncate(text, 60);
    assert.ok(short.length <= 60);
    assert.ok(short.endsWith("word…"));
    assert.equal(truncate("short", 60), "short");
  });

  it("skips badges, quotes, lists and code before the first paragraph", () => {
    const text =
      "# T\n[![b](x)](y)\n> quote\n- item\n\nFirst line\nsecond line.\n\nNext.";
    assert.equal(firstParagraph(text), "First line second line.");
  });

  it("appends paragraphs up to a minimum length", () => {
    assert.equal(firstParagraph("One.\n\nTwo.\n\nThree.", 8), "One. Two.");
    assert.equal(firstParagraph("Only."), "Only.");
  });

  it("describes a document in at most 160 characters", () => {
    assert.equal(describe("Intro:"), "Intro.");
    assert.ok(describe("x ".repeat(200)).length <= 160);
  });
});

suite("HTML rendering", () => {
  it("escapes HTML", () => {
    assert.equal(
      escapeHtml(`<a href="x">&</a>`),
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("renders code, bold and links, escaping the rest", () => {
    assert.equal(
      inlineHtml("**Bold** `<x>` [y](z) <b>"),
      '<strong>Bold</strong> <code>&lt;x&gt;</code> <a href="z">y</a> &lt;b&gt;',
    );
  });
});

suite("links", () => {
  it("computes relative URLs between site pages", () => {
    assert.equal(relativeUrl("/docs/api/", "/docs/cli/"), "../cli/");
    assert.equal(relativeUrl("/docs/api/", "/"), "../../");
    assert.equal(relativeUrl("/", "/docs/"), "docs/");
    assert.equal(relativeUrl("/docs/", "/docs/"), "./");
    assert.equal(relativeUrl("/404.html", "/docs/"), "docs/");
  });

  it("rewrites links outside code only, including labels with code", () => {
    const text = '[a](x) `[b](x)` [`c`](x) ![d](x "t")\n```\n[e](x)\n```';
    const out = mapLinks(text, () => "Y");
    assert.equal(out, '[a](Y) `[b](x)` [`c`](Y) ![d](Y "t")\n```\n[e](x)\n```');
  });

  const pages = new Map([
    ["README.md", "/docs/getting-started/"],
    ["docs/API.md", "/docs/api/"],
    ["docs/CLI.md", "/docs/cli/"],
  ]);
  const rewrite = linkRewriter({
    sourcePath: "docs/API.md",
    pageUrl: "/docs/api/",
    pages,
    repoUrl: "https://github.com/o/r",
  });

  it("maps published documents to relative site URLs with anchors", () => {
    assert.equal(rewrite("CLI.md#options"), "../cli/#options");
    assert.equal(rewrite("../README.md"), "../getting-started/");
  });

  it("sends other repository files to GitHub", () => {
    assert.equal(
      rewrite("../SECURITY.md"),
      "https://github.com/o/r/blob/main/SECURITY.md",
    );
    assert.equal(rewrite("../src/"), "https://github.com/o/r/tree/main/src");
  });

  it("leaves external links, anchors and paths outside the repository alone", () => {
    assert.equal(rewrite("https://x.test/a.md"), "https://x.test/a.md");
    assert.equal(rewrite("mailto:a@b.test"), "mailto:a@b.test");
    assert.equal(rewrite("//cdn.test/x"), "//cdn.test/x");
    assert.equal(rewrite("#methods"), "#methods");
    assert.equal(rewrite("../../elsewhere.md"), "../../elsewhere.md");
  });

  it("points same-page anchors at another page when asked", () => {
    const landing = linkRewriter({
      sourcePath: "README.md",
      pageUrl: "/",
      pages,
      repoUrl: "https://github.com/o/r",
      anchorPage: "/docs/getting-started/",
    });
    assert.equal(landing("#cli-usage"), "docs/getting-started/#cli-usage");
  });
});

suite("frontmatter and structured lists", () => {
  it("writes values as JSON strings and skips empty ones", () => {
    assert.equal(
      frontmatter({ title: 'A "B": c', n: 1, skip: undefined }),
      '---\ntitle: "A \\"B\\": c"\nn: 1\n---\n',
    );
  });

  it("reads link tables", () => {
    const rows = linkTable(
      "| Guide | Contents |\n|---|---|\n| [API](API.md) | `x` methods |\n| plain | row |",
    );
    assert.deepEqual(rows, [
      { label: "API", target: "API.md", summary: "x methods" },
    ]);
  });

  it("reads bullet lists with bold leads", () => {
    assert.deepEqual(leadList("- **A**: one\n* **B** - two\n- plain"), [
      { title: "A", text: "one" },
      { title: "B", text: "two" },
    ]);
  });
});
