/**
 * Server-side signals in the scanned project's package.json: XSLT packages
 * among the dependencies, and npm scripts that run xsltproc. They lower the
 * rating of stylesheets that no browser code uses. Pure: the text comes
 * from the caller.
 *
 * @module xslt-migrate-check/manifest
 */

/** npm packages that run XSLT on the server or replace the browser's. */
export const SERVER_SIDE_PACKAGES = Object.freeze([
  "@tradik/xslt-processor",
  "xslt-processor",
  "saxon-js",
  "libxslt",
  "xslt3",
  "xsltproc",
]);

/** The package.json fields that declare dependencies. */
export const DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]);

/**
 * Parse a package.json text; anything that is not a JSON object yields
 * an empty object.
 *
 * @param {string|null|undefined} text - The file's text
 * @returns {object} The manifest
 */
export function parseManifest(text) {
  try {
    const manifest = JSON.parse(text ?? "");
    return manifest !== null && typeof manifest === "object" ? manifest : {};
  } catch {
    return {};
  }
}

/**
 * List the server-side XSLT packages that a package.json depends on, plus
 * "xsltproc" when one of its npm scripts runs it. A missing or invalid
 * package.json yields an empty list.
 *
 * @param {string|null|undefined} text - The root package.json text
 * @returns {string[]} Matching package names, in SERVER_SIDE_PACKAGES order
 */
export function serverSidePackages(text) {
  const manifest = parseManifest(text);
  const declared = new Set(
    DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] || {})),
  );
  const scripts = Object.values(manifest.scripts || {});
  if (scripts.some((script) => /\bxsltproc\b/.test(String(script)))) {
    declared.add("xsltproc");
  }
  return SERVER_SIDE_PACKAGES.filter((name) => declared.has(name));
}
