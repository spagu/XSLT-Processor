/**
 * Conformance runner - worker thread entry point.
 *
 * Receives `{ testCase, baseDir }` messages and answers each with the
 * {@link import('./runCase.mjs').CaseOutcome} of that case. The main thread
 * terminates and replaces the worker when a case exceeds its time limit.
 */

import { parentPort } from "node:worker_threads";
import { runCase } from "./runCase.mjs";

parentPort.on("message", async ({ testCase, baseDir }) => {
  parentPort.postMessage(await runCase(testCase, baseDir));
});
