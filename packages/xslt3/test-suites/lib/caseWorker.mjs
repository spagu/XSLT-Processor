/**
 * Worker thread of the isolated runner (see isolation.mjs): loads the
 * engine adapter once, then runs the test cases it receives on its port
 * and answers each with its verdict, waking the main thread through the
 * shared signal (1: a message is ready, 2: the worker failed to start).
 *
 * @module test-suites/lib/caseWorker
 */

import { workerData } from "node:worker_threads";
import { loadAdapter } from "./adapter.mjs";
import { runCase } from "./runner.mjs";

const { port, signal, kind, parseOnly, adapterPath } = workerData;

/**
 * Post a message and wake the main thread.
 *
 * @param {object} message - Message
 * @param {number} [state] - Signal value
 */
function answer(message, state = 1) {
  port.postMessage(message);
  Atomics.store(signal, 0, state);
  Atomics.notify(signal, 0);
}

try {
  const adapter = await loadAdapter(adapterPath);
  port.on("message", (testCase) => {
    answer(runCase(testCase, { kind, adapter, parseOnly }));
  });
  answer({ ready: true });
} catch (error) {
  answer({ startupError: String(error?.message ?? error) }, 2);
}
