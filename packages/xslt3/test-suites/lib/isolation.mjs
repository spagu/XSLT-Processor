/**
 * Isolated test runs: each test case runs in a worker thread under a time
 * limit, so an expression that loops, recurses without end or exhausts
 * memory fails that case instead of the whole run.
 *
 * The runner stays synchronous: the main thread posts the case to the
 * worker and blocks in `Atomics.wait` until the worker signals its verdict
 * or the time limit passes; the verdict is read with
 * `receiveMessageOnPort`. A worker that times out is terminated and the
 * next case starts a new one (as the 1.0 conformance runner does).
 *
 * @module test-suites/lib/isolation
 */

import {
  MessageChannel,
  receiveMessageOnPort,
  Worker,
} from "node:worker_threads";
import { URL } from "node:url";

const WORKER_URL = new URL("./caseWorker.mjs", import.meta.url);

/** Default time limit per test case, in milliseconds. */
export const DEFAULT_TIMEOUT = 10000;

/** Time a worker may take to load the engine, in milliseconds. */
const STARTUP_TIMEOUT = 60000;

/**
 * @typedef {object} IsolatedRunner
 * @property {(testCase: object) => {status: string, reason: string}} run
 *   - Run one test case
 * @property {() => Promise<void>} close - Stop the worker
 */

/**
 * Create an isolated runner.
 *
 * @param {object} options - Options
 * @param {"qt3"|"xslt30"} options.kind - Suite kind
 * @param {boolean} [options.parseOnly] - qt3: only parse
 * @param {string} [options.adapterPath] - Adapter module (default engine)
 * @param {number} [options.timeout] - Time limit per case in milliseconds
 * @returns {IsolatedRunner} The runner
 */
export function createIsolatedRunner({
  kind,
  parseOnly = false,
  adapterPath,
  timeout = DEFAULT_TIMEOUT,
}) {
  let current = null;

  const start = () => {
    const signal = new Int32Array(new SharedArrayBuffer(4));
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(WORKER_URL, {
      workerData: { port: port2, signal, kind, parseOnly, adapterPath },
      transferList: [port2],
    });
    Atomics.wait(signal, 0, 0, STARTUP_TIMEOUT);
    const message = receiveMessageOnPort(port1)?.message;
    if (!message?.ready) {
      worker.terminate();
      throw new Error(
        `Test worker did not start: ${message?.startupError ?? "timeout"}`,
      );
    }
    return { worker, port: port1, signal };
  };

  return {
    run(testCase) {
      current ??= start();
      const { worker, port, signal } = current;
      Atomics.store(signal, 0, 0);
      port.postMessage(testCase);
      if (Atomics.wait(signal, 0, 0, timeout) === "timed-out") {
        current = null;
        worker.terminate();
        return {
          status: "fail",
          reason: `timeout after ${timeout} ms (or the worker crashed)`,
        };
      }
      return receiveMessageOnPort(port).message;
    },
    async close() {
      const worker = current?.worker;
      current = null;
      await worker?.terminate();
    },
  };
}
