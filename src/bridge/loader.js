/**
 * Loading @tradik/xslt3
 *
 * @tradik/xslt3 is an optional peer dependency: it is loaded with a dynamic
 * `import()` the first time an XSLT 2.0/3.0 stylesheet needs it (or when
 * `XSLTProcessor.preload()` is called), never statically, so the XSLT 1.0
 * bundles do not contain it. Once loaded it is kept for the synchronous API.
 *
 * @module bridge/loader
 */

/**
 * What to do when @tradik/xslt3 is missing, with the command of each package
 * manager. Shown whatever the import error was: Node's "Cannot find package",
 * Yarn Plug'n'Play's "tried to access ... but it isn't provided", bun's own.
 */
export const XSLT3_MISSING =
  "install @tradik/xslt3 to run XSLT 2.0/3.0 stylesheets " +
  "(npm install @tradik/xslt3, yarn add @tradik/xslt3, " +
  "pnpm add @tradik/xslt3 or bun add @tradik/xslt3)";

/**
 * The default importer. The specifier is a literal so that bundlers of the
 * application can resolve it; the build of this package keeps it external.
 *
 * @returns {Promise<object>} The @tradik/xslt3 module
 */
const importXslt3 = () => import("@tradik/xslt3");

let importer = importXslt3;
let loaded = null;
let pending = null;

/**
 * Load @tradik/xslt3 once; concurrent calls share the import.
 *
 * @returns {Promise<object>} The @tradik/xslt3 module
 * @throws {Error} "Cannot load @tradik/xslt3: install ..." when the import
 *   fails (the import error is the `cause`); a later call tries again
 *
 * @example
 * const { compileStylesheet } = await loadXslt3();
 */
export function loadXslt3() {
  if (loaded) return Promise.resolve(loaded);
  pending ??= Promise.resolve()
    .then(() => importer())
    .then(
      (module) => {
        loaded = module;
        return module;
      },
      (error) => {
        pending = null;
        throw new Error(`Cannot load @tradik/xslt3: ${XSLT3_MISSING}`, {
          cause: error,
        });
      },
    );
  return pending;
}

/**
 * The module loaded by {@link loadXslt3}, for the synchronous API.
 *
 * @returns {object|null} The module, null before it has been loaded
 */
export function loadedXslt3() {
  return loaded;
}

/**
 * Replace the importer of @tradik/xslt3 and forget the loaded module
 * (tests: simulate a missing package without uninstalling it).
 *
 * @param {(() => Promise<object>)|null} [replacement] - The importer, or
 *   null for the default `import("@tradik/xslt3")`
 * @returns {void}
 */
export function setXslt3Importer(replacement) {
  importer = replacement ?? importXslt3;
  loaded = null;
  pending = null;
}
