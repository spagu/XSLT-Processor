#!/usr/bin/env node
/**
 * Static file server for the browser tests (no dependencies).
 *
 * Serves the built bundles under `/dist/` and the test pages under
 * `/tests/browser/fixtures/`, both relative to the repository root. Any other
 * path, and any path that would escape those directories, answers 404, so the
 * server never exposes the rest of the working copy.
 *
 * Usage: node tests/browser/server.mjs [port]   (default 4173, or $PORT)
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root, the directory the URL paths are resolved against. */
export const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** URL prefixes that may be served. */
const ALLOWED_PREFIXES = Object.freeze(["/dist/", "/tests/browser/fixtures/"]);

/** Content types by file extension. */
const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".xsl": "application/xml; charset=utf-8",
});

/**
 * Map a request URL path to a file inside an allowed directory.
 *
 * @param {string} urlPath - Decoded URL path, e.g. `/dist/xslt-processor.js`
 * @returns {string|null} Absolute file path, or null when not servable
 *
 * @example
 * resolveRequestPath("/dist/xslt-processor.js"); // "<root>/dist/xslt-processor.js"
 * resolveRequestPath("/dist/../package.json"); // null
 */
export function resolveRequestPath(urlPath) {
  const clean = normalize(urlPath).split(sep).join("/");
  if (!ALLOWED_PREFIXES.some((prefix) => clean.startsWith(prefix))) {
    return null;
  }
  return join(repoRoot, clean);
}

/**
 * Create the HTTP server (not yet listening).
 *
 * @returns {import('node:http').Server} Server answering GET and HEAD
 */
export function createStaticServer() {
  return createServer(async (request, response) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(request.url, "http://x").pathname);
    } catch {
      urlPath = "";
    }
    const file = resolveRequestPath(urlPath);
    if (file === null || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type":
          CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404).end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
  createStaticServer().listen(port, "127.0.0.1", () => {
    console.log(`Browser test server on http://127.0.0.1:${port}/`);
  });
}
