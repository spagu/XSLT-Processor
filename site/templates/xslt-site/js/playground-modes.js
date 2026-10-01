/**
 * Modes of the playground and how the page picks one: the ?mode= query
 * parameter wins, then the mode the visitor used last (localStorage), then
 * XSLT 1.0.
 *
 * @module playground-modes
 */

/** Mode ids, as used in ?mode= and in localStorage. */
export const MODES = Object.freeze({ xslt: "xslt", xpath: "xpath" });

/** localStorage key of the last mode. */
export const MODE_KEY = "xslt-playground-mode";

/**
 * Whether a value is a known mode id.
 *
 * @param {*} value - Candidate
 * @returns {boolean} True for "xslt" and "xpath"
 */
export const isMode = (value) => Object.values(MODES).includes(value);

/**
 * The mode to open with.
 *
 * @param {string} search - location.search ("?mode=xpath")
 * @param {string|null} stored - The remembered mode, null when none
 * @returns {string} A mode id
 */
export function resolveMode(search, stored) {
  const requested = new URLSearchParams(search).get("mode");
  if (isMode(requested)) return requested;
  return isMode(stored) ? stored : MODES.xslt;
}

/**
 * The page address for a mode: ?mode=xpath for XPath 3.1, no parameter for
 * XSLT 1.0 (the default), other query parameters and the hash kept.
 *
 * @param {string} href - Current address
 * @param {string} mode - Mode id
 * @returns {string} The address to show
 */
export function modeUrl(href, mode) {
  const url = new URL(href);
  if (mode === MODES.xslt) url.searchParams.delete("mode");
  else url.searchParams.set("mode", mode);
  return url.href;
}

/**
 * Read the remembered mode; storage may be unavailable (private windows,
 * blocked site data), which counts as nothing remembered.
 *
 * @param {() => Storage} storage - Returns localStorage (it may throw)
 * @returns {string|null} The stored value
 */
export function loadMode(storage) {
  try {
    return storage().getItem(MODE_KEY);
  } catch {
    return null;
  }
}

/**
 * Remember a mode; failures are ignored, the mode is a convenience.
 *
 * @param {() => Storage} storage - Returns localStorage (it may throw)
 * @param {string} mode - Mode id
 */
export function saveMode(storage, mode) {
  try {
    storage().setItem(MODE_KEY, mode);
  } catch {
    // Storage is blocked or full: the mode is simply not remembered.
  }
}
