/**
 * Helpers for generating benchmark XML and stylesheets.
 *
 * @module scripts/benchmark/xml
 */

/** Seeded pseudo-random numbers (mulberry32), in [0, 1). */
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Wrap templates in an XSLT 1.0 stylesheet.
 *
 * @param {string} body - Top-level elements
 * @param {string} [method="xml"] - Output method
 * @returns {string} The stylesheet
 */
export function stylesheet(body, method = "xml") {
  return (
    '<xsl:stylesheet version="1.0" ' +
    'xmlns:xsl="http://www.w3.org/1999/XSL/Transform">' +
    `<xsl:output method="${method}"/>${body}</xsl:stylesheet>`
  );
}

/**
 * Repeat an element built from its index.
 *
 * @param {number} count - Number of elements
 * @param {(index: number) => string} build - Markup of one element
 * @returns {string} The concatenated markup
 */
export function repeat(count, build) {
  const parts = new Array(count);
  for (let index = 0; index < count; index++) parts[index] = build(index);
  return parts.join("");
}
