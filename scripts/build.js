#!/usr/bin/env node

/**
 * Build script for xslt-processor
 *
 * Creates:
 * - dist/xslt-processor.js - ESM module
 * - dist/xslt-processor.cjs - CommonJS module
 * - dist/xslt-processor.browser.js - Browser bundle (IIFE)
 * - dist/xslt-processor.browser.min.js - Minified browser bundle
 * - dist/xslt-processor.d.ts - TypeScript declarations (ESM)
 * - dist/xslt-processor.d.cts - TypeScript declarations (CommonJS)
 */

import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const srcDir = join(rootDir, "src");
const distDir = join(rootDir, "dist");

// @tradik/xslt3 (XSLT 2.0/3.0, xsltVersion "auto") is an optional peer
// dependency loaded with import() at run time: never bundled
const external = ["@tradik/xslt3"];

// Ensure dist directory exists
mkdirSync(distDir, { recursive: true });

async function buildAll() {
  console.log("Building xslt-processor...\n");

  // ESM build
  console.log("Building ESM module...");
  await build({
    entryPoints: [join(srcDir, "index.js")],
    outfile: join(distDir, "xslt-processor.js"),
    bundle: true,
    external,
    format: "esm",
    platform: "neutral",
    target: ["es2022"],
    sourcemap: true,
  });

  // CommonJS build
  console.log("Building CommonJS module...");
  await build({
    entryPoints: [join(srcDir, "index.js")],
    outfile: join(distDir, "xslt-processor.cjs"),
    bundle: true,
    external,
    format: "cjs",
    platform: "node",
    target: ["node20"],
    sourcemap: true,
  });

  // Browser IIFE build
  console.log("Building browser bundle...");
  await build({
    entryPoints: [join(srcDir, "index.js")],
    outfile: join(distDir, "xslt-processor.browser.js"),
    bundle: true,
    external,
    format: "iife",
    globalName: "XsltProcessorLib",
    platform: "browser",
    target: ["es2022"],
    sourcemap: true,
    footer: {
      js: `
// Auto-install as global XSLTProcessor replacement if native is not functional,
// and apply an <?xml-stylesheet?> the browser left unapplied (XML documents)
if (typeof window !== 'undefined') {
  XsltProcessorLib.installGlobal();
  XsltProcessorLib.autoApplyXmlStylesheet();
}
`,
    },
  });

  // Minified browser build
  console.log("Building minified browser bundle...");
  await build({
    entryPoints: [join(srcDir, "index.js")],
    outfile: join(distDir, "xslt-processor.browser.min.js"),
    bundle: true,
    external,
    format: "iife",
    globalName: "XsltProcessorLib",
    platform: "browser",
    target: ["es2022"],
    minify: true,
    sourcemap: true,
    footer: {
      js: `if(typeof window!=='undefined'){XsltProcessorLib.installGlobal();XsltProcessorLib.autoApplyXmlStylesheet();}`,
    },
  });

  // `@tradik/xslt-processor/polyfill`: the calls of src/polyfill.js on the
  // package's own bundles, so importing both loads the library once
  console.log("Writing the polyfill entry...");
  const polyfillCalls = "installGlobal();\nautoApplyXmlStylesheet();\n";
  writeFileSync(
    join(distDir, "polyfill.js"),
    `import { autoApplyXmlStylesheet, installGlobal } from "./xslt-processor.js";\n${polyfillCalls}`,
  );
  writeFileSync(
    join(distDir, "polyfill.cjs"),
    `"use strict";\nconst { autoApplyXmlStylesheet, installGlobal } = require("./xslt-processor.cjs");\n${polyfillCalls}`,
  );
  writeFileSync(join(distDir, "polyfill.d.ts"), "export {};\n");

  // Generate TypeScript declarations
  console.log("Generating TypeScript declarations...");
  // Maintained as a real declaration file next to this script
  const declarations = readFileSync(
    join(__dirname, "xslt-processor.d.ts"),
    "utf8",
  );

  // The same declarations are emitted twice so that TypeScript's node16/nodenext
  // resolution picks a CommonJS-flavoured file for `require()` consumers instead
  // of treating the ESM `.d.ts` as the type source of the `.cjs` bundle.
  writeFileSync(join(distDir, "xslt-processor.d.ts"), declarations);
  writeFileSync(join(distDir, "xslt-processor.d.cts"), declarations);

  console.log("\nBuild complete! Output files:");
  console.log("  dist/xslt-processor.js         - ESM module");
  console.log("  dist/xslt-processor.cjs        - CommonJS module");
  console.log(
    '  dist/polyfill.js, polyfill.cjs  - import "@tradik/xslt-processor/polyfill"',
  );
  console.log("  dist/xslt-processor.browser.js - Browser bundle");
  console.log("  dist/xslt-processor.browser.min.js - Minified browser bundle");
  console.log(
    "  dist/xslt-processor.d.ts       - TypeScript declarations (ESM)",
  );
  console.log(
    "  dist/xslt-processor.d.cts      - TypeScript declarations (CommonJS)",
  );
}

try {
  await buildAll();
} catch (error) {
  console.error("Build failed:", error);
  process.exit(1);
}
