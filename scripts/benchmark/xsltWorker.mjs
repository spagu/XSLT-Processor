#!/usr/bin/env node
/**
 * XSLT engine benchmark worker: one engine, one DOM and one scenario in
 * its own process, so the engines never share a heap, a JIT or a module
 * cache. The source and the stylesheet (in.xml, t.xsl of the input
 * directory, with params.json) are parsed once, untimed, with jsdom or
 * @xmldom/xmldom installed globally as the CLI does (bin/lib/dom.js);
 * SaxonJS parses with its own tree (`--dom saxon`). Then:
 *
 * - `--mode measure`: phase `compile` times compiling the stylesheet,
 *   phase `transform` times transforming and serializing with one compiled
 *   stylesheet (worker protocol of measure.mjs: `run` lines, `done`);
 * - `--mode check`: one transformation, its output written to
 *   `out-<engine>-<dom>.txt` in the input directory, then
 *   `{"type":"check","chars":...}`.
 *
 * Usage: node --expose-gc xsltWorker.mjs --engine "1.0 package"|xslt3|saxon
 *        --dom jsdom|xmldom|saxon --dir <input dir> [--mode measure|check]
 *        [--warmup 2] [--runs 7] [--saxon-dir <dir>]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { installDomGlobals, loadDomEnvironment } from "../../bin/lib/dom.js";
import { REPO_ROOT, confinePath } from "../lib/fsSafety.mjs";
import { XSLT_ENGINE_ADAPTERS, engineSlug } from "./xsltEngines.mjs";

/** A warm-up slower than this switches to 1 warm-up and 3 measured runs. */
const SLOW_RUN_MS = 10000;

const { values } = parseArgs({
  options: {
    engine: { type: "string" },
    dom: { type: "string", default: "jsdom" },
    dir: { type: "string" },
    mode: { type: "string", default: "measure" },
    warmup: { type: "string", default: "2" },
    runs: { type: "string", default: "7" },
    "saxon-dir": { type: "string" },
  },
});

/**
 * Write one protocol message.
 *
 * @param {object} message - JSON-serializable message
 */
function report(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/**
 * Time `warmup + runs` runs of `once`, reporting each.
 *
 * @param {string} phase - Phase name
 * @param {() => void} once - One run
 */
function timeRuns(phase, once) {
  let warmup = Number(values.warmup);
  let runs = Number(values.runs);
  for (let index = 0; index < warmup + runs; index++) {
    globalThis.gc?.();
    const start = process.hrtime.bigint();
    once();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    report({ type: "run", phase, ms, warmup: index < warmup });
    if (index === 0 && ms > SLOW_RUN_MS) {
      warmup = 1;
      runs = Math.min(runs, 3);
    }
  }
}

/**
 * The engine context: parsed documents (unless SaxonJS parses them).
 *
 * @param {string} dir - Input directory
 * @returns {Promise<import("./xsltEngines.mjs").EngineContext>} Context
 */
async function context(dir) {
  const ctx = {
    root: REPO_ROOT,
    dir,
    params: JSON.parse(readFileSync(join(dir, "params.json"), "utf8")),
    saxonDir: values["saxon-dir"],
  };
  if (values.dom === "saxon") return ctx;
  const dom = installDomGlobals(await loadDomEnvironment(values.dom));
  const parse = (text) =>
    new dom.window.DOMParser().parseFromString(text, "application/xml");
  return {
    ...ctx,
    parse,
    xml: parse(readFileSync(join(dir, "in.xml"), "utf8")),
    xsl: parse(readFileSync(join(dir, "t.xsl"), "utf8")),
  };
}

/**
 * Load the engine and the inputs, then measure or check.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const adapter = XSLT_ENGINE_ADAPTERS[values.engine];
  if (!adapter) throw new Error(`Unknown engine: ${values.engine}`);
  const dir = confinePath(values.dir);
  const engine = await adapter.load(await context(dir));
  if (values.mode === "check") {
    const output = engine.run(engine.compile());
    const name = `out-${engineSlug(values.engine)}-${values.dom}.txt`;
    writeFileSync(confinePath(join(dir, name)), output);
    report({ type: "check", chars: output.length });
  } else {
    timeRuns("compile", () => engine.compile());
    const compiled = engine.compile();
    timeRuns("transform", () => engine.run(compiled));
  }
  report({ type: "done", maxRssKb: process.resourceUsage().maxRSS });
}

main().catch((error) => {
  report({ type: "error", message: String(error?.message ?? error) });
  process.exitCode = 1;
});
