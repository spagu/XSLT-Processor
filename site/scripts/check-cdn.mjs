/**
 * CDN URLs with a fingerprinted file name in the built site. ssg's
 * fingerprinting rewrites an asset file name next to a quote, slash or
 * parenthesis anywhere in a page or script (spagu/ssg#316), so a code sample
 * or a bundle that quotes the library's jsDelivr or unpkg URL would name a
 * file the CDN does not have. layouts/migrate.html writes its quotes as
 * &quot; and vendor.mjs escapes the dot before "js" to avoid it; these checks
 * catch what slips through.
 *
 * @module check-cdn
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** A CDN URL of this project's packages whose file name has an 8-digit hash. */
export const HASHED_CDN_URL =
  /(?:cdn\.jsdelivr\.net|unpkg\.com)\/npm\/@tradik\/[^\s"'<>]*\.[0-9a-f]{8}\.js/;

/**
 * The first fingerprinted CDN URL of a page, in its text or in a src/href.
 *
 * @param {Document} doc - Parsed page
 * @returns {string|null} The URL, or null when there is none
 */
export function hashedCdnUrl(doc) {
  const texts = [
    doc.documentElement.textContent,
    ...Array.from(
      doc.querySelectorAll("[src],[href]"),
      (el) => el.getAttribute("src") ?? el.getAttribute("href"),
    ),
  ];
  const match = texts.map((text) => HASHED_CDN_URL.exec(text)).find(Boolean);
  return match ? match[0] : null;
}

/**
 * Check the built scripts for CDN URLs with a fingerprinted file name: ssg
 * rewrites asset names in scripts too (spagu/ssg#316), so a bundle that
 * quotes the library's CDN URL (the online check's) must escape it.
 *
 * @param {string} root - Output directory
 * @returns {string[]} Problems
 */
export function scriptProblems(root) {
  return readdirSync(root, { recursive: true })
    .filter((name) => name.endsWith(".js"))
    .flatMap((name) => {
      const hashed = HASHED_CDN_URL.exec(
        readFileSync(join(root, name), "utf8"),
      );
      return hashed
        ? [`${name}: CDN URL with a fingerprinted file name: ${hashed[0]}`]
        : [];
    });
}
