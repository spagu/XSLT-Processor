/**
 * Measuring in worker processes: a worker script times its runs itself and
 * reports them on stdout (the protocol below); the runner summarizes them
 * per phase (measure.mjs `summarize`).
 *
 * @module scripts/benchmark/workerMeasure
 */

import { join } from "node:path";
import { lastLine, runChild, summarize } from "./measure.mjs";

/** Worker script (one in-process scenario of one version). */
const WORKER = join(import.meta.dirname, "worker.mjs");

/**
 * Run a worker script (`node --expose-gc script ...args`) that speaks the
 * worker protocol: `{"type":"run","ms":...,"warmup":bool,"phase"?:...}`
 * per run, then `{"type":"done","maxRssKb":...}`, or `{"type":"error"}`.
 * Runs are summarized per `phase` ("default" when a run names none).
 *
 * @param {object} options - Options
 * @param {string} options.script - Worker script
 * @param {string[]} options.args - Its arguments
 * @param {number} options.timeoutMs - Per-run timeout
 * @returns {Promise<{status: string, note?: string, phases?: Record<string, import("./measure.mjs").Measurement>}>}
 *   Per-phase measurements, or a timeout or error status with a note
 */
export async function measureScript({ script, args, timeoutMs }) {
  const phases = new Map();
  let done = null;
  let failure = null;
  const onLine = (line) => {
    if (!line.startsWith("{")) return;
    const message = JSON.parse(line);
    if (message.type === "run") {
      const phase = message.phase ?? "default";
      if (!phases.has(phase)) phases.set(phase, { times: [], warmups: 0 });
      if (message.warmup) phases.get(phase).warmups++;
      else phases.get(phase).times.push(message.ms);
    } else if (message.type === "done") done = message;
    else if (message.type === "error") failure = message.message;
  };
  const command = ["--expose-gc", script, ...args];
  const result = await runChild(
    process.execPath,
    command,
    {},
    timeoutMs,
    onLine,
  );
  if (result.timedOut) {
    return { status: "timeout", note: `a run took over ${timeoutMs / 1000} s` };
  }
  if (failure || !done) {
    return { status: "error", note: failure ?? lastLine(result.stderr) };
  }
  const summaries = {};
  for (const [phase, { times, warmups }] of phases) {
    summaries[phase] = summarize(times, warmups, done.maxRssKb);
  }
  return { status: "ok", phases: summaries };
}

/**
 * Measure one in-process scenario in a worker process.
 *
 * @param {object} options - Worker options
 * @param {string} options.root - Version directory
 * @param {string} options.dir - Input directory (in.xml, t.xsl)
 * @param {string} options.kind - "lib" or "stream"
 * @param {number} options.warmup - Warm-up runs
 * @param {number} options.runs - Measured runs
 * @param {number} options.timeoutMs - Per-run timeout
 * @returns {Promise<import("./measure.mjs").Measurement>} The measurement
 */
export async function measureWorker({
  root,
  dir,
  kind,
  warmup,
  runs,
  timeoutMs,
}) {
  const args = ["--root", root, "--dir", dir, "--kind", kind];
  args.push("--warmup", String(warmup), "--runs", String(runs));
  const result = await measureScript({ script: WORKER, args, timeoutMs });
  return result.phases ? result.phases.default : result;
}
