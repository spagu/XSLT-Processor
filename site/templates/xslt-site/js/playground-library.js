/**
 * Loading @tradik/xslt3 for the playground's XSLT 3.0 and XPath 3.1 modes:
 * one import() of the browser bundle, shared by both modes, made on the first
 * run so the XSLT 1.0 mode never downloads it.
 *
 * @module playground-library
 */

/**
 * A loader that runs `load` once and shares its promise; a failed load is
 * tried again on the next call.
 *
 * @param {() => Promise<object>} load - Imports the module
 * @returns {(() => Promise<object>) & { started: () => boolean }} The loader
 */
export function lazyImport(load) {
  let promise = null;
  const get = () =>
    (promise ??= load().catch((error) => {
      promise = null;
      throw error;
    }));
  get.started = () => promise !== null;
  return get;
}

/**
 * Runs work that needs the library: shows "Loading" on the first run, reports
 * a failed load, and drops a run that a newer run or a mode switch overtook
 * while the library was loading.
 *
 * @param {object} page - What the runs need
 * @param {ReturnType<typeof lazyImport>} page.library - The loader
 * @param {{ textContent: string }} page.statusLine - Status line
 * @param {(messages: object[]) => void} page.showMessages - Fills the message list
 * @param {() => boolean} page.isActive - Whether the mode is still current
 * @returns {(work: (lib: object) => void) => Promise<void>} Runs `work`
 */
export function libraryRunner({ library, statusLine, showMessages, isActive }) {
  let runs = 0;
  return async (work) => {
    const ticket = ++runs;
    let lib;
    try {
      if (!library.started()) statusLine.textContent = "Loading @tradik/xslt3…";
      lib = await library();
    } catch (error) {
      statusLine.textContent = "@tradik/xslt3 could not be loaded.";
      showMessages([{ level: "error", text: String(error.message) }]);
      return;
    }
    if (ticket === runs && isActive()) work(lib);
  };
}
