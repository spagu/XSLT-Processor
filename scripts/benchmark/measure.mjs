/**
 * Timing helpers of the benchmark runner: child processes with a per-run
 * timeout, and the summary statistics (median, p95, min, peak RSS).
 *
 * @module scripts/benchmark/measure
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";

/** Worker script (one in-process scenario of one version). */
const WORKER = join(import.meta.dirname, "worker.mjs");

/** Preloaded into CLI runs: prints the peak RSS on stderr at exit. */
export const RSS_REPORTER = join(import.meta.dirname, "rss.mjs");

/** Marker line written by rss.mjs. */
const RSS_MARKER = /BENCH_MAXRSS_KB=(\d+)/;

/**
 * @typedef {Object} Measurement
 * @property {"ok"|"timeout"|"error"|"skipped"} status - Outcome
 * @property {number} [warmup] - Warm-up runs done
 * @property {number} [runs] - Measured runs
 * @property {number} [medianMs] - Median wall time of the measured runs
 * @property {number} [p95Ms] - 95th percentile (nearest rank)
 * @property {number} [minMs] - Fastest measured run
 * @property {number|null} [maxRssMb] - Peak resident set size, MB
 * @property {string} [note] - Why a scenario failed or was skipped
 */

/**
 * Summarize measured run times.
 *
 * @param {number[]} times - Wall times in ms
 * @param {number} warmup - Warm-up runs that preceded them
 * @param {number|null} maxRssKb - Peak RSS in kB, or null when unknown
 * @returns {Measurement} The summary
 */
export function summarize(times, warmup, maxRssKb) {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  const round = (ms) => Math.round(ms * 100) / 100;
  return {
    status: "ok",
    warmup,
    runs: sorted.length,
    medianMs: round(
      sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    ),
    p95Ms: round(at(0.95)),
    minMs: round(sorted[0]),
    maxRssMb: maxRssKb == null ? null : Math.round(maxRssKb / 1024),
  };
}

/**
 * Run a child process; `onLine` sees every stdout line. The process is
 * killed when no line arrives for `timeoutMs` (the worker writes one line
 * per run, so this is a per-run timeout).
 *
 * @param {string} command - Executable
 * @param {string[]} args - Arguments
 * @param {object} options - spawn options (cwd, env)
 * @param {number} timeoutMs - Longest silence allowed
 * @param {(line: string) => void} [onLine] - stdout line callback
 * @returns {Promise<{code: number|null, timedOut: boolean, stderr: string, ms: number}>}
 */
export function runChild(command, args, options, timeoutMs, onLine = () => {}) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    let stderr = "";
    let pending = "";
    const kill = () => {
      timedOut = true;
      child.kill("SIGKILL");
    };
    let timer = setTimeout(kill, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (data) => {
      const lines = (pending + data).split("\n");
      pending = lines.pop();
      clearTimeout(timer);
      timer = setTimeout(kill, timeoutMs);
      lines.forEach(onLine);
    });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      stderr += data;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (pending) onLine(pending);
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ code, timedOut, stderr, ms });
    });
  });
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
 * @returns {Promise<Measurement>} The measurement
 */
export async function measureWorker({
  root,
  dir,
  kind,
  warmup,
  runs,
  timeoutMs,
}) {
  const times = [];
  let warmups = 0;
  let done = null;
  let failure = null;
  const onLine = (line) => {
    if (!line.startsWith("{")) return;
    const message = JSON.parse(line);
    if (message.type === "run" && message.warmup) warmups++;
    else if (message.type === "run") times.push(message.ms);
    else if (message.type === "done") done = message;
    else if (message.type === "error") failure = message.message;
  };
  const args = ["--expose-gc", WORKER, "--root", root, "--dir", dir];
  args.push("--kind", kind, "--warmup", String(warmup), "--runs", String(runs));
  const result = await runChild(process.execPath, args, {}, timeoutMs, onLine);
  if (result.timedOut) {
    return { status: "timeout", note: `a run took over ${timeoutMs / 1000} s` };
  }
  if (failure || !done) {
    return { status: "error", note: failure ?? lastLine(result.stderr) };
  }
  return summarize(times, warmups, done.maxRssKb);
}

/**
 * Last non-empty line of a text, for error notes.
 *
 * @param {string} text - Text
 * @returns {string} The line
 */
export function lastLine(text) {
  const lines = text.trim().split("\n");
  return lines[lines.length - 1] || "no output";
}

/**
 * Measure a command run once per iteration (CLI and binary scenarios).
 *
 * @param {object} options - Options
 * @param {string} options.command - Executable
 * @param {string[]} options.args - Arguments
 * @param {object} options.spawnOptions - cwd and env
 * @param {number} options.warmup - Warm-up runs
 * @param {number} options.runs - Measured runs
 * @param {number} options.timeoutMs - Per-run timeout
 * @returns {Promise<Measurement>} The measurement
 */
export async function measureCommand({
  command,
  args,
  spawnOptions,
  warmup,
  runs,
  timeoutMs,
}) {
  const times = [];
  let maxRssKb = null;
  for (let index = 0; index < warmup + runs; index++) {
    const result = await runChild(command, args, spawnOptions, timeoutMs);
    if (result.timedOut) {
      return {
        status: "timeout",
        note: `a run took over ${timeoutMs / 1000} s`,
      };
    }
    if (result.code !== 0) {
      return { status: "error", note: lastLine(result.stderr) };
    }
    const rss = RSS_MARKER.exec(result.stderr);
    if (rss) maxRssKb = Math.max(maxRssKb ?? 0, Number(rss[1]));
    if (index >= warmup) times.push(result.ms);
  }
  return summarize(times, warmup, maxRssKb);
}
