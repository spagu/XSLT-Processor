import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  assetPath,
  checkSite,
  pageProblems,
  scriptProblems,
} from "./check-site.mjs";
import { PAIRS, contrast, contrastProblems, parseTokens } from "./contrast.mjs";

const tokensCss = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../templates/xslt-site/css/tokens.css",
  ),
  "utf8",
);

const head = `<meta name="viewport" content="x"><meta name="description" content="d">
<link rel="canonical" href="https://x.test/"><meta name="theme-color" content="#fff">
<meta property="og:title" content="t"><meta property="og:description" content="d">
<meta property="og:url" content="u"><meta property="og:image" content="i"><meta property="og:type" content="website">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="t"><meta name="twitter:description" content="d">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
<script>gtag('config', 'G-TEST');</script>`;
const page = (body, lang = ' lang="en"') =>
  `<!DOCTYPE html><html${lang}><head><title>T</title>${head}</head><body>${body}</body></html>`;
const parse = (html) => new JSDOM(html).window.document;

describe("pageProblems", () => {
  it("accepts a complete page", () => {
    assert.deepEqual(
      pageProblems(
        parse(page("<main><h1>A</h1><h2>B</h2><h3>C</h3><h2>D</h2></main>")),
      ),
      [],
    );
  });

  it("reports a CDN URL whose file name was fingerprinted", () => {
    const hashed =
      "https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.c9c8999c.js";
    const inText = pageProblems(
      parse(page(`<main><h1>A</h1><pre><code>${hashed}</code></pre></main>`)),
    );
    assert.deepEqual(inText, [
      `CDN URL with a fingerprinted file name: ${hashed.slice(8)}`,
    ]);
    const inAttribute = pageProblems(
      parse(page(`<main><h1>A</h1><a href="${hashed}">x</a></main>`)),
    );
    assert.equal(inAttribute.length, 1);
    const fine = pageProblems(
      parse(
        page(
          "<main><h1>A</h1><code>https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/xslt-processor.browser.min.js</code></main>",
        ),
      ),
    );
    assert.deepEqual(fine, []);
  });

  it("reports missing head tags, landmarks and headings", () => {
    const problems = pageProblems(
      parse(
        "<html><head></head><body><h1>a</h1><h1>b</h1><h3>c</h3><img src=x><iframe></iframe></body></html>",
      ),
    );
    for (const expected of [
      "missing <html lang>",
      "empty <title>",
      'missing meta[name="description"]',
      "missing Google Analytics gtag.js in <head>",
      "expected exactly one <main>",
      "expected exactly one <h1>",
      "image without alt: x",
      "iframe without title: ",
    ]) {
      assert.ok(problems.includes(expected), expected);
    }
  });

  it("reports a Google Tag Manager snippet, which the site does not use", () => {
    const gtm =
      "<script>j.src='https://www.googletagmanager.com/gtm.js?id=G'</script>";
    const problems = pageProblems(
      parse(
        page("<main><h1>A</h1></main>").replace("</head>", `${gtm}</head>`),
      ),
    );
    assert.deepEqual(problems, [
      "Google Tag Manager on the page: the site uses Google Analytics only",
    ]);
  });

  it("reports skipped heading levels", () => {
    const problems = pageProblems(
      parse(page("<main><h1>A</h1><h3>C</h3></main>")),
    );
    assert.deepEqual(problems, ['heading level skipped: <h3> "C"']);
  });
});

describe("assetPath", () => {
  it("finds an asset by its plain or its fingerprinted name", () => {
    const root = mkdtempSync(join(tmpdir(), "site-asset-"));
    mkdirSync(join(root, "css"));
    writeFileSync(join(root, "css", "tokens.css"), "");
    assert.equal(
      assetPath(root, "css/tokens.css"),
      join(root, "css", "tokens.css"),
    );
    rmSync(join(root, "css", "tokens.css"));
    writeFileSync(join(root, "css", "tokens.f55532e6.css"), "");
    writeFileSync(join(root, "css", "tokens-extra.0123abcd.css"), "");
    assert.equal(
      assetPath(root, "css/tokens.css"),
      join(root, "css", "tokens.f55532e6.css"),
    );
    assert.throws(() => assetPath(root, "css/missing.css"), /missing\.css/);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("checkSite", () => {
  let root;
  before(() => {
    root = mkdtempSync(join(tmpdir(), "site-check-"));
    mkdirSync(join(root, "docs", "api"), { recursive: true });
    mkdirSync(join(root, "css"));
    writeFileSync(join(root, "css", "site.css"), "");
    writeFileSync(
      join(root, "index.html"),
      page(
        '<main><h1>Home</h1><a href="/p/docs/api/#ok">ok</a><a href="docs/api/#gone">x</a><a href="/p/missing/">y</a><a href="/elsewhere/">z</a><a href="https://example.com/">e</a><link rel="preconnect" href="https://fonts.test"><link rel="stylesheet" href="/p/css/site.css"></main>',
      ),
    );
    writeFileSync(
      join(root, "docs", "api", "index.html"),
      page('<main><h1 id="ok">API</h1><a href="../../">home</a></main>'),
    );
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it("resolves links under the prefix and checks anchors", () => {
    const problems = checkSite(root, "/p", tokensCss);
    assert.deepEqual(problems, [
      "index.html: missing anchor docs/api/#gone",
      "index.html: broken link /p/missing/",
      "index.html: /elsewhere/ is outside /p/",
    ]);
  });

  it("finds CDN URLs with a fingerprinted name in built scripts", () => {
    const dir = mkdtempSync(join(tmpdir(), "site-scripts-"));
    mkdirSync(join(dir, "vendor"));
    const cdn = "https://cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/";
    writeFileSync(
      join(dir, "vendor", "ok.js"),
      `a="${cdn}x.browser.min\\x2ejs"`,
    );
    writeFileSync(join(dir, "bad.js"), `a="${cdn}x.browser.min.c9c8999c.js"`);
    writeFileSync(join(dir, "notes.txt"), `${cdn}x.c9c8999c.js`);
    assert.deepEqual(scriptProblems(dir), [
      "bad.js: CDN URL with a fingerprinted file name: cdn.jsdelivr.net/npm/@tradik/xslt-processor@1/dist/x.browser.min.c9c8999c.js",
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs from the command line", () => {
    const script = join(
      dirname(fileURLToPath(import.meta.url)),
      "check-site.mjs",
    );
    const usage = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(usage.status, 2);
    mkdirSync(join(root, "css"), { recursive: true });
    writeFileSync(join(root, "css", "tokens.css"), tokensCss);
    const failing = spawnSync(process.execPath, [script, root, "/p/"], {
      encoding: "utf8",
    });
    assert.equal(failing.status, 1);
    assert.match(failing.stderr, /3 problem\(s\)/);
    writeFileSync(join(root, "index.html"), page("<main><h1>Home</h1></main>"));
    const passing = spawnSync(process.execPath, [script, root, "/p"], {
      encoding: "utf8",
    });
    assert.equal(passing.status, 0);
    assert.match(passing.stdout, /Site checks passed: 2 pages/);
  });
});

describe("contrast", () => {
  it("computes WCAG ratios", () => {
    assert.equal(contrast("#000000", "#ffffff").toFixed(0), "21");
    assert.equal(contrast("#2563eb", "#ffffff").toFixed(2), "5.17");
  });

  it("reads light and dark tokens, dark falling back to light", () => {
    const tokens = parseTokens(
      ":root{--color-a:#FFFFFF;--color-b:#000000}@media (prefers-color-scheme: dark){:root{--color-a:#111111}}",
    );
    assert.deepEqual(tokens, {
      light: { a: "#ffffff", b: "#000000" },
      dark: { a: "#111111", b: "#000000" },
    });
    assert.deepEqual(parseTokens(":root{--color-a:#ffffff}").dark, {
      a: "#ffffff",
    });
  });

  it("passes for the site palette in both schemes", () => {
    assert.deepEqual(contrastProblems(parseTokens(tokensCss)), []);
  });

  it("reports failing and missing pairs", () => {
    const tokens = parseTokens(tokensCss);
    tokens.light.muted = "#bbbbbb";
    delete tokens.dark.focus;
    const problems = contrastProblems(tokens);
    assert.ok(
      problems.some((p) => p.startsWith("light: --color-muted on --color-bg")),
    );
    assert.ok(problems.includes("dark: token --color-focus is not defined"));
    assert.ok(PAIRS.length > 10);
  });
});
