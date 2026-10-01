#!/usr/bin/env node
/**
 * XPath benchmark worker: one engine, one DOM, in its own process, so the
 * engines never share a heap, a JIT or a module cache. It parses the
 * generated document (xpathScenarios.mjs) once, untimed, then:
 *
 * - `--mode measure` (one scenario): phase `compiled` compiles the
 *   expression once and times its evaluation; phase `oneShot` times
 *   compile + evaluate in one call (`evaluateXPath`). A scenario with
 *   `contexts` evaluates once per such element in each run. Writes the
 *   worker protocol of measure.mjs (`run` lines with a `phase`, `done`).
 * - `--mode check` (any number of scenarios): evaluates each once and
 *   writes `{"type":"check","id":...,"summary":{...}}` (or `"error"`).
 *
 * Usage: node --expose-gc xpathWorker.mjs --engine "1.0 package"|xslt3
 *        --dom jsdom|xmldom --scenario id[,id] [--mode measure|check]
 *        [--warmup 2] [--runs 7]
 */

import { parseArgs } from "node:util";
import { REPO_ROOT } from "../lib/fsSafety.mjs";
import { ENGINES, loadEngine, summarizeResults } from "./xpathEngines.mjs";
import { XPATH_SCENARIOS, xpathDocument } from "./xpathScenarios.mjs";

/** A warm-up slower than this switches to 1 warm-up and 3 measured runs. */
const SLOW_RUN_MS = 10000;

const { values } = parseArgs({
  options: {
    engine: { type: "string" },
    dom: { type: "string", default: "jsdom" },
    scenario: { type: "string" },
    mode: { type: "string", default: "measure" },
    warmup: { type: "string", default: "2" },
    runs: { type: "string", default: "7" },
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
 * Parse the benchmark document with the chosen DOM.
 *
 * @param {string} dom - "jsdom" or "xmldom"
 * @returns {Promise<Document>} The document
 */
async function parseDocument(dom) {
  const xml = xpathDocument();
  if (dom === "xmldom") {
    const { DOMParser } = await import("@xmldom/xmldom");
    return new DOMParser().parseFromString(xml, "application/xml");
  }
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("");
  return new window.DOMParser().parseFromString(xml, "application/xml");
}

/**
 * Context nodes of a scenario: the document, or every element named by
 * `contexts` (found with the DOM, so not timed against an engine).
 *
 * @param {Document} doc - The document
 * @param {import("./xpathScenarios.mjs").XPathScenario} scenario - Scenario
 * @returns {Node[]} Contexts
 */
function contextsOf(doc, scenario) {
  if (!scenario.contexts) return [doc];
  return Array.from(doc.getElementsByTagName(scenario.contexts));
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
 * Measure one scenario: compiled evaluation, then one-shot.
 *
 * @param {object} lib - Engine module
 * @param {import("./xpathEngines.mjs").Engine} engine - Engine adapter
 * @param {Node[]} contexts - Context nodes
 * @param {string} expression - Expression
 */
function measure(lib, engine, contexts, expression) {
  const evaluate = engine.compile(lib, expression);
  timeRuns("compiled", () => {
    for (const node of contexts) evaluate(node);
  });
  timeRuns("oneShot", () => {
    for (const node of contexts) engine.oneShot(lib, expression, node);
  });
}

/**
 * Evaluate scenarios once each and report their result summaries.
 *
 * @param {object} lib - Engine module
 * @param {import("./xpathEngines.mjs").Engine} engine - Engine adapter
 * @param {Document} doc - The document
 * @param {string[]} ids - Scenario ids
 */
function check(lib, engine, doc, ids) {
  for (const id of ids) {
    const scenario = XPATH_SCENARIOS[id];
    try {
      const evaluate = engine.compile(lib, scenario.expression);
      const results = contextsOf(doc, scenario).map(evaluate);
      report({ type: "check", id, summary: summarizeResults(results) });
    } catch (error) {
      report({ type: "check", id, error: String(error?.message ?? error) });
    }
  }
}

/**
 * Load the engine and the document, then measure or check.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const engine = ENGINES[values.engine];
  if (!engine) throw new Error(`Unknown engine: ${values.engine}`);
  const ids = values.scenario.split(",");
  const unknown = ids.find((id) => !XPATH_SCENARIOS[id]);
  if (unknown) throw new Error(`Unknown scenario: ${unknown}`);
  const lib = await loadEngine(REPO_ROOT, values.engine);
  const doc = await parseDocument(values.dom);
  if (values.mode === "check") check(lib, engine, doc, ids);
  else {
    const scenario = XPATH_SCENARIOS[ids[0]];
    measure(lib, engine, contextsOf(doc, scenario), scenario.expression);
  }
  report({ type: "done", maxRssKb: process.resourceUsage().maxRSS });
}

main().catch((error) => {
  report({ type: "error", message: String(error?.message ?? error) });
  process.exitCode = 1;
});
