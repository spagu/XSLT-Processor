/**
 * Comparing the serialized outputs of two XSLT engines (pure helpers of
 * the correctness pre-check, xsltCheck.mjs).
 *
 * Two differences are serializer defaults, not results, and are removed
 * before comparing (`normalizeOutput`):
 *
 * - the line break after the XML declaration: the 1.0 package writes one,
 *   as libxslt does; @tradik/xslt3 writes none. Whitespace outside the
 *   document element is not part of the document;
 * - `<!DOCTYPE html>` before an HTML result: XSLT 3.0 serializes the html
 *   method as HTML5 by default (html-version 5), which has this doctype;
 *   the 1.0 package writes HTML 4 without a doctype unless asked.
 *
 * Anything else counts as a difference.
 *
 * @module scripts/benchmark/xsltCompare
 */

/**
 * Remove the serializer-default differences listed above.
 *
 * @param {string} output - Serialized result
 * @returns {string} Normalized result
 */
export function normalizeOutput(output) {
  return output
    .replace(/^<!DOCTYPE html>\r?\n?/i, "")
    .replace(/^(<\?xml[^>]*\?>)\r?\n/, "$1");
}

/**
 * Remove whitespace between tags as well (for SaxonJS, which indents HTML
 * by default; used only for the local, unpublished comparison).
 *
 * @param {string} output - Serialized result
 * @returns {string} Normalized result
 */
export function normalizeLoose(output) {
  return normalizeOutput(output).replaceAll(/>\s+</g, "><");
}

/**
 * Text around an offset, on one line, for a report.
 *
 * @param {string} text - Text
 * @param {number} offset - Offset
 * @param {number} [width=60] - Characters on each side
 * @returns {string} The excerpt, JSON-quoted
 */
export function excerpt(text, offset, width = 60) {
  return JSON.stringify(
    text.slice(Math.max(0, offset - width), offset + width),
  );
}

/**
 * Index of the first character where two texts differ.
 *
 * @param {string} a - Text
 * @param {string} b - Text
 * @returns {number} The offset, or -1 when they are equal
 */
export function firstDifference(a, b) {
  if (a === b) return -1;
  let index = 0;
  while (index < a.length && a[index] === b[index]) index++;
  return index;
}

/**
 * @typedef {Object} OutputDifference
 * @property {number} offset - First differing offset (after normalizing)
 * @property {number[]} chars - Lengths of the two normalized outputs
 * @property {string[]} context - Excerpts of both outputs at the offset
 */

/**
 * Compare two outputs after normalizing them.
 *
 * @param {string} a - First output
 * @param {string} b - Second output
 * @param {(text: string) => string} [normalize=normalizeOutput] - Normalizer
 * @returns {OutputDifference|null} The difference, or null when equal
 */
export function compareOutputs(a, b, normalize = normalizeOutput) {
  const [x, y] = [normalize(a), normalize(b)];
  const offset = firstDifference(x, y);
  if (offset === -1) return null;
  return {
    offset,
    chars: [x.length, y.length],
    context: [excerpt(x, offset), excerpt(y, offset)],
  };
}
