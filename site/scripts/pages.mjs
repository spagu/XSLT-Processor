/**
 * Which repository documents become which site pages, and how each page and
 * the landing page data are assembled from them. Pure functions over file
 * contents; build-content.mjs does the reading and writing.
 *
 * @module site/scripts/pages
 */

import { posix } from "node:path";
import {
  describe,
  firstHeading,
  firstParagraph,
  frontmatter,
  inlineHtml,
  leadList,
  linkRewriter,
  linkTable,
  mapLinks,
  sections,
  stripTitle,
  subsections,
  truncate,
  relativeUrl,
} from "./markdown.mjs";

/** Web URL of the repository, for links to files the site does not publish. */
export const REPO_URL = "https://github.com/spagu/XSLT-Processor";

/** Site URL of the page built from README.md. */
export const GETTING_STARTED_URL = "/docs/getting-started/";

/**
 * Page titles that differ from the document's own heading. README.md is
 * titled with the package name; docs/README.md is titled "Documentation",
 * and ssg turns every Markdown list item whose whole text equals a page
 * title into a root-absolute link to that page (the CHANGELOG has a
 * "- Documentation" item), which breaks when the site is hosted under a path.
 */
const TITLES = {
  "README.md": "Getting started",
  "docs/README.md": "Documentation overview",
};

/**
 * Site URL for a repository Markdown file, or null when it is not published
 * (SECURITY.md, LICENSE.md and the other project files stay on GitHub).
 *
 * @param {string} repoPath - Repository path, e.g. "docs/API.md"
 * @returns {string|null} Site URL
 */
export function pageUrl(repoPath) {
  if (repoPath === "README.md") return GETTING_STARTED_URL;
  if (repoPath === "CHANGELOG.md") return "/changelog/";
  if (repoPath === "docs/README.md") return "/docs/";
  const doc = /^docs\/([^/]+)\.md$/.exec(repoPath);
  return doc ? `/docs/${doc[1].toLowerCase()}/` : null;
}

/**
 * Map of every published repository path to its site URL.
 *
 * @param {string[]} repoPaths - Candidate repository paths
 * @returns {Map<string, string>} Repository path to site URL
 */
export function pageMap(repoPaths) {
  const map = new Map();
  for (const path of repoPaths) {
    const url = pageUrl(path);
    if (url) map.set(path, url);
  }
  return map;
}

/**
 * Remove the README's badge block and "Source Code" note: the site header
 * already links the repository and npm.
 *
 * @param {string} text - README.md source
 * @returns {string} README without badges
 */
export function stripBadges(text) {
  return text
    .split("\n")
    .filter(
      (line) => !/^\s*\[!\[/.test(line) && !/^>\s*\*\*Source Code/.test(line),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * The site page for one repository document: frontmatter plus Markdown body
 * with links rewritten to site URLs.
 *
 * @param {object} options - Page options
 * @param {string} options.repoPath - Repository path of the document
 * @param {string} options.text - Document source
 * @param {Map<string, string>} options.pages - Repository path to site URL
 * @returns {{ file: string, content: string, title: string, url: string, description: string }} The page
 */
export function buildPage({ repoPath, text, pages }) {
  const url = pages.get(repoPath);
  const source = repoPath === "README.md" ? stripBadges(text) : text;
  const heading = firstHeading(source) ?? posix.basename(repoPath, ".md");
  const title = TITLES[repoPath] ?? heading;
  const description = describe(source);
  const rewrite = linkRewriter({
    sourcePath: repoPath,
    pageUrl: url,
    pages,
    repoUrl: REPO_URL,
  });
  const body = mapLinks(stripTitle(source), rewrite);
  const slug = url.split("/").filter(Boolean).pop() ?? "index";
  const head = frontmatter({
    title,
    description,
    slug,
    link: url,
    status: "publish",
    type: "page",
    layout: "doc",
    source_path: repoPath,
  });
  const file = `${url.replace(/^\/|\/$/g, "") || "index"}.md`;
  return { file, content: `${head}\n${body}\n`, title, url, description };
}

/** Relative `<img src="...">` targets in HTML embedded in Markdown. */
const HTML_IMAGE = /(<img\b[^>]*?\bsrc=")([^"#?]+)(")/g;

/**
 * Whether an image target is a local file relative to the document.
 *
 * @param {string} src - The `src` value
 * @returns {boolean} True for relative paths without a scheme
 */
function isLocalImage(src) {
  return !/^([a-z][a-z0-9+.-]*:|\/)/i.test(src);
}

/**
 * Publish the local images that a document embeds with `<img>`: each is
 * served from `/assets/<directory of the document>/<src>`, and its `src` is
 * rewritten to a URL relative to the page, so it works under any base path.
 * Markdown image syntax is handled by the link rewriter already.
 *
 * @param {object} options - Options
 * @param {string} options.repoPath - Repository path of the document
 * @param {string} options.pageUrl - Site URL of the page
 * @param {string} options.content - Generated page content
 * @returns {{ content: string, assets: { from: string, to: string }[] }} The
 *   rewritten content and the files to copy (repository path to site path)
 */
export function publishImages({ repoPath, pageUrl, content }) {
  const dir = posix.dirname(repoPath);
  const assets = [];
  const rewritten = content.replace(HTML_IMAGE, (match, open, src, close) => {
    if (!isLocalImage(src)) return match;
    const from = posix.normalize(posix.join(dir, src));
    if (from.startsWith("..")) return match;
    const to = `/assets/${from}`;
    assets.push({ from, to });
    return `${open}${relativeUrl(pageUrl, to)}${close}`;
  });
  return { content: rewritten, assets };
}

/**
 * Illustration for a README feature, chosen by keywords in its title. Every
 * card gets one; unknown features fall back to the transform pipeline.
 *
 * @param {string} title - Feature title
 * @returns {string} Image file name below the theme's images/features/
 */
export function featureImage(title) {
  const rules = [
    [/native|compat|drop-in/i, "api.svg"],
    [/xpath/i, "xpath.svg"],
    [/output|serializ/i, "output.svg"],
    [/xslt/i, "xslt.svg"],
    [/dependenc/i, "zero-deps.svg"],
    [/format|bundle/i, "formats.svg"],
    [/typescript|types/i, "types.svg"],
  ];
  const match = rules.find(([pattern]) => pattern.test(title));
  return match ? match[1] : "transform.svg";
}

/**
 * Landing page data taken from README.md, so the home page says what the
 * README says: the introduction, why the library exists, the features, the
 * install command and the CDN quick start.
 *
 * @param {object} options - Options
 * @param {string} options.readme - README.md source
 * @param {Map<string, string>} options.pages - Repository path to site URL
 * @param {string} options.version - Package version
 * @returns {object} Data for the landing layout (data/landing.json)
 */
export function landingData({ readme, pages, version }) {
  const text = stripBadges(readme);
  const parts = sections(text);
  const rewrite = linkRewriter({
    sourcePath: "README.md",
    pageUrl: "/",
    pages,
    repoUrl: REPO_URL,
    anchorPage: GETTING_STARTED_URL,
  });
  const md = (heading) => mapLinks(parts.get(heading) ?? "", rewrite);
  const quick = subsections(parts.get("Quick Start") ?? "");
  const cdnKey = [...quick.keys()].find((key) => /cdn/i.test(key));
  const toHtml = (line) => inlineHtml(mapLinks(line, rewrite));
  return {
    version,
    intro: truncate(firstParagraph(text), 300),
    why: md("Background"),
    features: leadList(parts.get("Features") ?? "").map((item) => ({
      title: toHtml(item.title),
      html: toHtml(item.text),
      image: featureImage(item.title),
    })),
    install: md("Installation"),
    quickstartTitle: cdnKey ?? "",
    quickstart: cdnKey ? mapLinks(quick.get(cdnKey), rewrite) : "",
  };
}

/**
 * The home page source. Its text lives in data/landing.json; the page only
 * carries the title, the description (the README introduction) and the
 * landing layout.
 *
 * @param {{ intro: string }} landing - Landing page data
 * @returns {string} Markdown with frontmatter
 */
export function homePage(landing) {
  return frontmatter({
    title: "XSLT 1.0 in JavaScript",
    description: truncate(landing.intro, 160),
    slug: "home",
    link: "/",
    status: "publish",
    type: "page",
    layout: "landing",
  });
}

/**
 * Documentation navigation: the getting started page, then the guides in
 * the order and with the labels of the table in docs/README.md.
 *
 * @param {object} options - Options
 * @param {string} options.docsIndex - docs/README.md source
 * @param {Map<string, string>} options.pages - Repository path to site URL
 * @returns {{ label: string, url: string, summary: string }[]} Navigation items
 */
export function docsNav({ docsIndex, pages }) {
  const guides = linkTable(docsIndex)
    .map((row) => ({
      label: row.label,
      url: pages.get(posix.normalize(posix.join("docs", row.target))),
      summary: row.summary,
    }))
    .filter((item) => item.url);
  return [
    {
      label: "Getting started",
      url: GETTING_STARTED_URL,
      summary: "Install the package and run a first transformation.",
    },
    ...guides,
  ];
}
