/**
 * Conformance runner - worker thread management.
 */

import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";
import { Worker } from "node:worker_threads";

const workerUrl = new URL("./worker.mjs", import.meta.url);

/**
 * Runs cases one at a time in a worker thread, replacing the worker when a
 * case exceeds the time limit.
 */
export class CaseRunner {
  /**
   * @param {number} timeout - Time limit per case in milliseconds
   */
  constructor(timeout) {
    this.timeout = timeout;
    this.worker = null;
  }

  /**
   * Run one case.
   *
   * @param {import('./cases.mjs').ConformanceCase} testCase - Case
   * @param {string} baseDir - Directory loaded files are confined to
   * @returns {Promise<import('./runCase.mjs').CaseOutcome>} Outcome
   */
  run(testCase, baseDir) {
    this.worker ??= new Worker(workerUrl);
    const worker = this.worker;
    return new Promise((resolve) => {
      const finish = (outcome) => {
        clearTimeout(timer);
        worker.off("message", finish);
        worker.off("error", fail);
        resolve(outcome);
      };
      const fail = (error) => {
        this.worker = null;
        finish({
          output: null,
          error: `worker crashed: ${error.message}`,
          diagnostics: [],
          indented: false,
          encoding: null,
        });
      };
      const timer = setTimeout(() => {
        this.worker = null;
        worker.terminate();
        finish({
          output: null,
          error: `timeout after ${this.timeout} ms`,
          diagnostics: [],
          indented: false,
          encoding: null,
        });
      }, this.timeout);
      worker.on("message", finish);
      worker.on("error", fail);
      worker.postMessage({ testCase, baseDir });
    });
  }

  /** Stop the worker thread. */
  async close() {
    await this.worker?.terminate();
  }
}
