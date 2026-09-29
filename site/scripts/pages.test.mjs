import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPage,
  docsNav,
  featureImage,
  homePage,
  landingData,
  pageMap,
  pageUrl,
  stripBadges,
} from "./pages.mjs";

const readme = `# @tradik/xslt-processor

[![CI](https://x.test/b.svg)](https://x.test)

> **Source Code:** [github](https://github.com)

A JavaScript XSLT processor that replaces the native one in browsers and runs in Node.js too.

## Background

Browsers remove XSLT. See [deviations](docs/CONFORMANCE.md#known-deviations).

## Features

- **1:1 Native API Compatibility**: Drop-in \`XSLTProcessor\`
- **Something new**: Text

## Installation

\`\`\`bash
npm install @tradik/xslt-processor
\`\`\`

See [CLI Usage](#cli-usage).

## Quick Start

### Browser via CDN (Recommended)

Load the bundle.

### ESM Module

Import it.
`;

const pages = pageMap([
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "docs/README.md",
  "docs/API.md",
  "docs/CONFORMANCE.md",
]);

describe("page URLs", () => {
  it("maps documents to SEO-friendly URLs", () => {
    assert.equal(pageUrl("README.md"), "/docs/getting-started/");
    assert.equal(pageUrl("CHANGELOG.md"), "/changelog/");
    assert.equal(pageUrl("docs/README.md"), "/docs/");
    assert.equal(pageUrl("docs/SECURITY-LIMITS.md"), "/docs/security-limits/");
    assert.equal(pageUrl("SECURITY.md"), null);
    assert.equal(pageUrl("docs/sub/X.md"), null);
  });

  it("keeps only published documents in the map", () => {
    assert.equal(pages.has("SECURITY.md"), false);
    assert.equal(pages.get("docs/API.md"), "/docs/api/");
  });
});

describe("buildPage", () => {
  it("writes frontmatter, drops the title and rewrites links", () => {
    const page = buildPage({
      repoPath: "docs/API.md",
      text: "# API Reference\n\nThe API of the processor, all of its methods and every option they take. See [README](../README.md) and [policy](../SECURITY.md).",
      pages,
    });
    assert.equal(page.file, "docs/api.md");
    assert.equal(page.title, "API Reference");
    assert.match(page.content, /^---\ntitle: "API Reference"\n/);
    assert.match(page.content, /link: "\/docs\/api\/"/);
    assert.match(page.content, /layout: "doc"/);
    assert.match(page.content, /source_path: "docs\/API.md"/);
    assert.match(page.content, /\[README\]\(\.\.\/getting-started\/\)/);
    assert.match(page.content, /blob\/main\/SECURITY\.md/);
    assert.doesNotMatch(page.content, /^# API Reference/m);
  });

  it("titles README and the docs index for the site", () => {
    assert.equal(
      buildPage({ repoPath: "README.md", text: readme, pages }).title,
      "Getting started",
    );
    const index = buildPage({
      repoPath: "docs/README.md",
      text: "# Documentation\n\nGuides.",
      pages,
    });
    assert.equal(index.title, "Documentation overview");
    assert.equal(index.file, "docs.md");
  });

  it("falls back to the file name without a heading", () => {
    assert.equal(
      buildPage({ repoPath: "CHANGELOG.md", text: "Changes.", pages }).title,
      "CHANGELOG",
    );
  });

  it("removes badges from the README", () => {
    assert.doesNotMatch(stripBadges(readme), /\[!\[|Source Code/);
  });
});

describe("landing data", () => {
  const data = landingData({ readme, pages, version: "9.9.9" });

  it("takes the introduction, background and install text from the README", () => {
    assert.equal(data.version, "9.9.9");
    assert.match(data.intro, /^A JavaScript XSLT processor/);
    assert.match(data.why, /\(docs\/conformance\/#known-deviations\)/);
    assert.match(data.install, /npm install/);
    assert.match(data.install, /\(docs\/getting-started\/#cli-usage\)/);
  });

  it("turns features into cards with illustrations", () => {
    assert.deepEqual(data.features[0], {
      title: "1:1 Native API Compatibility",
      html: "Drop-in <code>XSLTProcessor</code>",
      image: "api.svg",
    });
    assert.equal(data.features[1].image, "transform.svg");
  });

  it("uses the CDN quick start", () => {
    assert.equal(data.quickstartTitle, "Browser via CDN (Recommended)");
    assert.equal(data.quickstart, "Load the bundle.");
  });

  it("copes with a README without the expected sections", () => {
    const empty = landingData({
      readme: "# X\n\nIntro text.",
      pages,
      version: "1",
    });
    assert.deepEqual(empty.features, []);
    assert.equal(empty.quickstart, "");
  });

  it("builds the home page frontmatter", () => {
    assert.match(homePage(data), /link: "\/"\n/);
    assert.match(homePage(data), /layout: "landing"/);
  });
});

describe("feature images", () => {
  it("chooses an illustration by keyword", () => {
    assert.equal(featureImage("XPath 1.0 Engine"), "xpath.svg");
    assert.equal(featureImage("XSLT 1.0"), "xslt.svg");
    assert.equal(featureImage("`xsl:output` Serialization"), "output.svg");
    assert.equal(featureImage("Zero Dependencies"), "zero-deps.svg");
    assert.equal(featureImage("Multiple Formats"), "formats.svg");
    assert.equal(featureImage("TypeScript Support"), "types.svg");
  });
});

describe("docs navigation", () => {
  it("follows the table of docs/README.md", () => {
    const nav = docsNav({
      docsIndex:
        "| Guide | Contents |\n|---|---|\n| [API Reference](API.md) | Methods |\n| [Gone](GONE.md) | x |",
      pages,
    });
    assert.deepEqual(
      nav.map((item) => item.url),
      ["/docs/getting-started/", "/docs/api/"],
    );
    assert.equal(nav[1].summary, "Methods");
  });
});
