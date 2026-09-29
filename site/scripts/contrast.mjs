/**
 * WCAG 2.2 contrast checks for the site palette in css/tokens.css.
 *
 * @module site/scripts/contrast
 */

/**
 * Foreground/background token pairs the theme actually uses, with the
 * minimum ratio: 4.5:1 for text (SC 1.4.3), 3:1 for control boundaries and
 * focus indicators (SC 1.4.11).
 */
export const PAIRS = [
  ...["bg", "surface", "surface-strong", "hero"].map((bg) => ["text", bg, 4.5]),
  ...["bg", "surface", "hero"].map((bg) => ["muted", bg, 4.5]),
  ...["bg", "surface", "surface-strong", "hero"].map((bg) => [
    "primary",
    bg,
    4.5,
  ]),
  ["on-primary", "primary", 4.5],
  ["success", "bg", 4.5],
  ["warning", "bg", 4.5],
  ["error", "bg", 4.5],
  ["control", "bg", 3],
  ["control", "surface", 3],
  ["focus", "bg", 3],
  ["focus", "surface", 3],
];

/**
 * Relative luminance of a #rrggbb colour (WCAG 2.2 definition).
 *
 * @param {string} hex - Colour
 * @returns {number} Luminance between 0 and 1
 */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast ratio of two colours.
 *
 * @param {string} a - Colour
 * @param {string} b - Colour
 * @returns {number} Ratio between 1 and 21
 */
export function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The --color-* tokens of the light scheme (:root) and the dark scheme
 * (:root inside the prefers-color-scheme: dark media query, over light).
 *
 * @param {string} css - Contents of tokens.css
 * @returns {{ light: Record<string, string>, dark: Record<string, string> }} Tokens
 */
export function parseTokens(css) {
  const read = (block) =>
    Object.fromEntries(
      [...block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [
        m[1],
        m[2].toLowerCase(),
      ]),
    );
  const darkAt = css.indexOf("prefers-color-scheme: dark");
  const light = read(darkAt === -1 ? css : css.slice(0, darkAt));
  const dark = { ...light, ...(darkAt === -1 ? {} : read(css.slice(darkAt))) };
  return { light, dark };
}

/**
 * Pairs below their minimum ratio, in either scheme.
 *
 * @param {{ light: Record<string, string>, dark: Record<string, string> }} tokens - Palette
 * @returns {string[]} Problems
 */
export function contrastProblems(tokens) {
  const problems = [];
  for (const [scheme, colors] of Object.entries(tokens)) {
    for (const [fg, bg, min] of PAIRS) {
      if (!colors[fg] || !colors[bg]) {
        problems.push(
          `${scheme}: token --color-${colors[fg] ? bg : fg} is not defined`,
        );
        continue;
      }
      const ratio = contrast(colors[fg], colors[bg]);
      if (ratio < min) {
        problems.push(
          `${scheme}: --color-${fg} on --color-${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`,
        );
      }
    }
  }
  return problems;
}
