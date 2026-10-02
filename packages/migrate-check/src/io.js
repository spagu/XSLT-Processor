/**
 * Process plumbing of the command: the writers bound to stdout and stderr,
 * quiet handling of a closed pipe, and how the scanned directory is shown.
 *
 * @module xslt-migrate-check/io
 */

import { toPosix } from "./walker.js";

/**
 * @typedef {object} CliIo
 * @property {(text: string) => void} write - Standard output
 * @property {(text: string) => void} writeError - Standard error
 * @property {boolean} isTTY - Whether standard output is a terminal
 */

/**
 * Let a closed pipe end the output quietly (`xslt-migrate-check | head`),
 * while any other stream error still surfaces.
 *
 * @param {import("node:events").EventEmitter} stream - A writable stream
 * @returns {void}
 */
export function ignoreBrokenPipe(stream) {
  stream.on("error", (error) => {
    if (error.code !== "EPIPE") throw error;
  });
}

/**
 * The CliIo of the current process.
 *
 * @returns {CliIo} Writers bound to process.stdout and process.stderr
 */
export function createProcessIo() {
  ignoreBrokenPipe(process.stdout);
  return {
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
    isTTY: Boolean(process.stdout.isTTY),
  };
}

/**
 * Show a directory argument the way the report quotes it: forward slashes
 * and a trailing slash ("." becomes "./").
 *
 * @param {string} directory - The argument as typed
 * @returns {string} The label
 */
export function directoryLabel(directory) {
  const label = toPosix(directory);
  return label.endsWith("/") ? label : `${label}/`;
}
