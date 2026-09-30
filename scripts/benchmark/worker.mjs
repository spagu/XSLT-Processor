#!/usr/bin/env node
/**
 * Benchmark worker: runs one in-process scenario (`lib` or `stream`, see
 * scenarios.mjs) of one version and reports on stdout, one JSON object per
 * line: `{"type":"run","ms":...,"warmup":true|false}` after every run and
 * `{"type":"done","maxRssKb":...,"chars":...}` at the end. The runner
 * (run.mjs) starts one worker per version and scenario, so the versions
 * never share a heap, a JIT or a module cache.
 *
 * The documents are parsed once with jsdom (the same jsdom for both
 * versions); a run is `new XSLTProcessor()` + `importStylesheet()` + the
 * transformation, with a garbage collection before it.
 *
 * Usage: node --expose-gc worker.mjs --root <version dir> --dir <input dir>
 *        --kind lib|stream [--warmup 2] [--runs 7]
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { confinePath } from "../lib/fsSafety.mjs";

/** A warm-up slower than this switches to 1 warm-up and 3 measured runs. */
const SLOW_RUN_MS = 10000;

const { values: args } = parseArgs({
  options: {
    root: { type: "string" },
    dir: { type: "string" },
    kind: { type: "string", default: "lib" },
    warmup: { type: "string", default: "2" },
    runs: { type: "string", default: "7" },
  },
});

/** Version directory and input directory, confined like every script path. */
const values = {
  ...args,
  root: confinePath(args.root),
  dir: confinePath(args.dir),
};

/**
 * First line of the last error the processor reported: transformToString()
 * logs the cause with console.error and returns null.
 */
let lastError = null;
console.error = (...parts) => {
  lastError = parts.map(String).join(" ").split("\n")[0];
};

/**
 * Write one protocol message.
 *
 * @param {object} message - JSON-serializable message
 */
function report(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/**
 * Read a transformation result stream to the end.
 *
 * @param {ReadableStream<string>} stream - The result stream
 * @returns {Promise<number>} Number of characters read
 */
async function drain(stream) {
  let chars = 0;
  for await (const chunk of stream) chars += chunk.length;
  return chars;
}

/**
 * Run one transformation.
 *
 * @param {Function} XSLTProcessor - The version's processor class
 * @param {Document} xsl - Parsed stylesheet
 * @param {Document} xml - Parsed source
 * @param {string} kind - "lib" or "stream"
 * @returns {Promise<number>} Length of the result in characters
 */
async function transformOnce(XSLTProcessor, xsl, xml, kind) {
  const processor = new XSLTProcessor();
  processor.importStylesheet(xsl);
  if (kind === "stream") return drain(processor.transformToStream(xml));
  const output = processor.transformToString(xml);
  if (output === null) throw new Error(lastError ?? "Transformation failed");
  return output.length;
}

/**
 * Parse the inputs, then time the warm-up and measured runs.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.XMLSerializer = dom.window.XMLSerializer;
  const parse = (name) =>
    new dom.window.DOMParser().parseFromString(
      readFileSync(join(values.dir, name), "utf8"),
      "application/xml",
    );
  const xml = parse("in.xml");
  const xsl = parse("t.xsl");
  const { XSLTProcessor } = await import(
    pathToFileURL(join(values.root, "src", "XSLTProcessor.js")).href
  );

  let warmup = Number(values.warmup);
  let runs = Number(values.runs);
  let chars = 0;
  for (let index = 0; index < warmup + runs; index++) {
    globalThis.gc?.();
    const start = process.hrtime.bigint();
    chars = await transformOnce(XSLTProcessor, xsl, xml, values.kind);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    report({ type: "run", ms, warmup: index < warmup });
    if (index === 0 && ms > SLOW_RUN_MS) {
      warmup = 1;
      runs = Math.min(runs, 3);
    }
  }
  report({ type: "done", maxRssKb: process.resourceUsage().maxRSS, chars });
}

main().catch((error) => {
  report({ type: "error", message: String(error?.message ?? error) });
  process.exitCode = 1;
});
