/**
 * What the "Listen" player of a blog post reads: the article as a list of
 * blocks (headings, paragraphs, list items, quotes), each with the element to
 * highlight and the text to speak. Code is not read out ("Code sample."),
 * images by their alt text, tables by their caption. No browser globals, so
 * the site tests run it under jsdom.
 */

/** Longest piece handed to the speech engine at once (Chrome stops long ones). */
export const MAX_CHUNK = 220;

/** Elements whose own text is one block. */
const TEXT_BLOCKS = new Set([
  "H1",
  "H2",
  "H3",
  "H4",
  "P",
  "LI",
  "BLOCKQUOTE",
  "DT",
  "DD",
  "FIGCAPTION",
]);

/** Containers read block by block. */
const CONTAINERS = new Set(["UL", "OL", "DL", "SECTION", "DIV", "FIGURE"]);

/**
 * The spoken text of an element, with whitespace collapsed.
 *
 * @param {Element} element - Element
 * @returns {string} Text
 */
function textOf(element) {
  return element.textContent.replaceAll(/\s+/g, " ").trim();
}

/**
 * The block for one element, or the blocks of its children.
 *
 * @param {Element} element - A child of the article
 * @returns {Array<{element: Element, text: string}>} Blocks
 */
function blocksOf(element) {
  const name = element.tagName;
  if (element.matches("[data-listen-skip]")) return [];
  if (name === "PRE") return [{ element, text: "Code sample." }];
  if (name === "IMG") {
    const alt = element.getAttribute("alt");
    return alt ? [{ element, text: `Image: ${alt}` }] : [];
  }
  if (name === "TABLE") {
    const caption = element.querySelector("caption");
    return [
      { element, text: caption ? `Table: ${textOf(caption)}` : "Table." },
    ];
  }
  if (TEXT_BLOCKS.has(name)) return textBlocks(element);
  if (CONTAINERS.has(name)) {
    return Array.from(element.children).flatMap((child) => blocksOf(child));
  }
  return [];
}

/**
 * A text block: its own text, then any nested list or code it holds; a block
 * with no text of its own but images (Markdown wraps an image in <p>) reads
 * the images.
 *
 * @param {Element} element - Heading, paragraph, list item...
 * @returns {Array<{element: Element, text: string}>} Blocks
 */
function textBlocks(element) {
  const nested = Array.from(element.children).filter((child) =>
    child.matches("ul, ol, pre"),
  );
  const own = Array.from(element.childNodes)
    .filter((node) => !nested.includes(node))
    .map((node) => node.textContent)
    .join("")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (!own && !nested.length) {
    return Array.from(element.querySelectorAll("img")).flatMap((img) =>
      blocksOf(img),
    );
  }
  const head = own ? [{ element, text: own }] : [];
  return [...head, ...nested.flatMap((child) => blocksOf(child))];
}

/**
 * The blocks of an article, in reading order.
 *
 * @param {Element} article - The post's <article>
 * @returns {Array<{element: Element, text: string}>} Blocks
 */
export function listenBlocks(article) {
  return Array.from(article.children).flatMap((child) => blocksOf(child));
}

/**
 * Split a block's text into pieces of at most MAX_CHUNK characters, at
 * sentence ends where possible, else at spaces.
 *
 * @param {string} text - Block text
 * @returns {string[]} Pieces
 */
export function chunks(text) {
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text];
  const pieces = [];
  let current = "";
  for (const sentence of sentences.map((part) => part.trim()).filter(Boolean)) {
    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length <= MAX_CHUNK) {
      current = joined;
      continue;
    }
    if (current) pieces.push(current);
    current = sentence;
    while (current.length > MAX_CHUNK) {
      const cut = current.lastIndexOf(" ", MAX_CHUNK);
      const at = cut > 0 ? cut : MAX_CHUNK;
      pieces.push(current.slice(0, at));
      current = current.slice(at).trim();
    }
  }
  if (current) pieces.push(current);
  return pieces;
}
