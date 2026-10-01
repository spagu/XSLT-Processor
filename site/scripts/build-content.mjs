#!/usr/bin/env node
/**
 * Generate the site's content from the repository before ssg runs.
 *
 * - README.md, CHANGELOG.md and docs/*.md become pages below
 *   site/content/xslt/pages/ with YAML frontmatter (title, description from
 *   the first paragraph, slug, link) and links rewritten to site URLs;
 * - site/pages/*.md (hand-written: playground, 404) are copied beside them;
 * - site/data/landing.json and site/data/nav.json feed the home page and the
 *   documentation sidebar;
 * - the browser bundle dist/xslt-processor.browser.min.js (run `npm run
 *   build` first) is copied to site/static/vendor/ for the playground, and
 *   @tradik/xslt3 is bundled beside it for the XPath 3.1 mode (vendor.mjs).
 *
 * Everything written here is generated and ignored by git; edit the sources.
 *
 * Usage: node site/scripts/build-content.mjs
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPage,
  docsNav,
  homePage,
  landingData,
  pageMap,
  publishImages,
} from "./pages.mjs";
import { buildXslt3Bundle, formatSize, XSLT3_BUNDLE } from "./vendor.mjs";

const siteDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = join(siteDir, "..");
const contentDir = join(siteDir, "content", "xslt");
const pagesDir = join(contentDir, "pages");
const dataDir = join(siteDir, "data");
const vendorDir = join(siteDir, "static", "vendor");
const bundle = "xslt-processor.browser.min.js";

/**
 * Read a repository file as UTF-8.
 *
 * @param {string} path - Path relative to the repository root
 * @returns {string} File contents
 */
function read(path) {
  return readFileSync(join(rootDir, path), "utf8");
}

/**
 * Write a file, creating its directory.
 *
 * @param {string} path - Absolute path
 * @param {string} contents - File contents
 */
function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const docs = readdirSync(join(rootDir, "docs"))
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => `docs/${name}`);
const sources = ["README.md", "CHANGELOG.md", ...docs];
const pages = pageMap(sources);

rmSync(contentDir, { recursive: true, force: true });
write(
  join(contentDir, "metadata.json"),
  JSON.stringify({ categories: [], users: [], tags: [], media: [] }) + "\n",
);

const assetsDir = join(siteDir, "static", "assets");
rmSync(assetsDir, { recursive: true, force: true });
for (const repoPath of sources) {
  const page = buildPage({ repoPath, text: read(repoPath), pages });
  const { content, assets } = publishImages({
    repoPath,
    pageUrl: page.url,
    content: page.content,
  });
  write(join(pagesDir, page.file), content);
  for (const asset of assets) {
    mkdirSync(dirname(join(siteDir, "static", asset.to)), { recursive: true });
    copyFileSync(join(rootDir, asset.from), join(siteDir, "static", asset.to));
  }
}

const handWritten = join(siteDir, "pages");
for (const name of readdirSync(handWritten).filter((n) => n.endsWith(".md"))) {
  copyFileSync(join(handWritten, name), join(pagesDir, name));
}

// Blog posts: ssg reads posts from a directory below posts/
const postsSource = join(siteDir, "posts");
const postsDir = join(contentDir, "posts", "blog");
mkdirSync(postsDir, { recursive: true });
for (const name of readdirSync(postsSource).filter((n) => n.endsWith(".md"))) {
  copyFileSync(join(postsSource, name), join(postsDir, name));
}

const { version } = JSON.parse(read("package.json"));
const landing = landingData({ readme: read("README.md"), pages, version });
write(join(dataDir, "landing.json"), JSON.stringify(landing, null, 2));
write(join(pagesDir, "home.md"), homePage(landing));
write(
  join(dataDir, "nav.json"),
  JSON.stringify(
    { docs: docsNav({ docsIndex: read("docs/README.md"), pages }) },
    null,
    2,
  ),
);

const built = join(rootDir, "dist", bundle);
if (!existsSync(built)) {
  console.error(`Missing dist/${bundle}: run \`npm run build\` first.`);
  process.exit(1);
}
mkdirSync(vendorDir, { recursive: true });
copyFileSync(built, join(vendorDir, bundle));

const xslt3 = await buildXslt3Bundle({
  entry: join(rootDir, "packages", "xslt3", "src", "index.js"),
  outfile: join(vendorDir, XSLT3_BUNDLE),
});

console.log(`Site content: ${sources.length} documents, version ${version}.`);
console.log(
  `XPath 3.1 bundle: ${formatSize(xslt3.raw)} (${formatSize(xslt3.gzip)} gzip).`,
);
