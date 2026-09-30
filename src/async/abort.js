/**
 * AbortSignal Helpers
 *
 * Every asynchronous entry point takes an optional `signal`. It is checked
 * between steps (and between output chunks), passed to loaders, and raced
 * against loader promises so that a loader ignoring the signal cannot keep an
 * aborted call pending. The synchronous parts (compiling the stylesheet,
 * building the result tree) cannot be interrupted once started.
 *
 * @module async/abort
 */

/**
 * The reason of an aborted signal, with a DOMException fallback for
 * implementations without `reason`.
 *
 * @param {AbortSignal} signal - An aborted signal
 * @returns {*} The abort reason
 */
function abortReason(signal) {
  return (
    signal.reason ??
    new globalThis.DOMException("This operation was aborted", "AbortError")
  );
}

/**
 * Throw the abort reason when a signal is aborted.
 *
 * @param {AbortSignal} [signal] - Optional signal
 * @returns {void}
 * @throws {*} The abort reason
 *
 * @example
 * throwIfAborted(options.signal);
 */
export function throwIfAborted(signal) {
  if (signal?.aborted) throw abortReason(signal);
}

/**
 * Settle with a promise, or reject with the abort reason as soon as the
 * signal aborts, whichever comes first.
 *
 * @template T
 * @param {Promise<T>|T} work - The pending work
 * @param {AbortSignal} [signal] - Optional signal
 * @returns {Promise<T>} The work's outcome, or the abort rejection
 *
 * @example
 * const text = await abortable(loader(uri), signal);
 */
export function abortable(work, signal) {
  if (!signal) return Promise.resolve(work);
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(work)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}
