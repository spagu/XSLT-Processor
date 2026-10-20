/**
 * Which references reach the website: entries of
 * site/references/references.json with `approved: true` (the project agreed
 * to be named), and their logo only when it is complete and a file of the
 * site (images/references/).
 *
 * @module site/scripts/approved-references
 */

/* global URL */

/**
 * The usedBy entries that may be published: those with `approved: true`.
 *
 * @param {Array<{name: string, url: string, use: string, approved?: boolean}>} entries
 * @returns {Array<{name: string, url: string, domain: string, use: string}>}
 *   Approved entries with the host name to show as the link text
 */
export function approvedReferences(entries) {
  return entries
    .filter((entry) => entry.approved === true)
    .map(({ name, url, use, logo }) => ({
      name,
      url,
      domain: new URL(url).hostname.replace(/^www\./, ""),
      use,
      ...(validLogo(logo) ? { logo } : {}),
    }));
}

/**
 * Whether an entry's logo can be shown: a path under the site, an alt text
 * and the intrinsic size (so the card does not shift while it loads). Add a
 * logo only when its owner allowed it, as for the entry itself.
 *
 * @param {*} logo - The entry's `logo` field
 * @returns {boolean} True for a complete logo
 */
function validLogo(logo) {
  return (
    typeof logo?.src === "string" &&
    /^images\/references\/[\w.-]+\.(png|svg|webp)$/.test(logo.src) &&
    typeof logo.alt === "string" &&
    logo.alt.length > 0 &&
    Number.isInteger(logo.width) &&
    Number.isInteger(logo.height)
  );
}
