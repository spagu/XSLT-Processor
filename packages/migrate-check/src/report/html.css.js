/**
 * The inline stylesheet of the HTML report. Colours are the website tokens
 * (site/templates/xslt-site/css/tokens.css, docs/STYLE-GUIDE.md), light and
 * dark through prefers-color-scheme; every text pair meets WCAG 2.2 AA.
 * No web fonts: the report makes no external request.
 *
 * @module xslt-migrate-check/report/html.css
 */

/** The CSS of the report, inlined in a <style> element. */
export const REPORT_CSS = `
:root {
  color-scheme: light dark;
  --color-bg: #ffffff;
  --color-surface: #f8f9fa;
  --color-surface-strong: #f1f3f4;
  --color-text: #1f2937;
  --color-muted: #5f6368;
  --color-primary: #2563eb;
  --color-on-badge: #ffffff;
  --color-success: #15803d;
  --color-warning: #b45309;
  --color-error: #dc2626;
  --color-border: #dadce0;
  --color-control: #80868b;
  --font-body: "IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #202124;
    --color-surface: #292a2d;
    --color-surface-strong: #35363a;
    --color-text: #e8eaed;
    --color-muted: #9aa0a6;
    --color-primary: #8ab4f8;
    --color-on-badge: #202124;
    --color-success: #81c995;
    --color-warning: #fdd663;
    --color-error: #f28b82;
    --color-border: #3c4043;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font: 16px/1.55 var(--font-body);
}
main { max-width: 72rem; margin: 0 auto; padding: 2rem 1rem 3rem; }
h1 { font-size: 1.75rem; line-height: 1.2; margin: 0 0 0.5rem; }
h2 { font-size: 1.25rem; margin: 2.5rem 0 0.75rem; }
h3 { font-size: 1.05rem; margin: 0 0 0.25rem; }
p { margin: 0.25rem 0 0.75rem; }
a { color: var(--color-primary); }
a:focus-visible, button:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 2px; }
.meta { color: var(--color-muted); margin: 0; }
.badge {
  display: inline-block;
  min-width: 4.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--color-muted);
  color: var(--color-on-badge);
  font-weight: 700;
  font-size: 0.85rem;
  text-align: center;
}
.badge-high { background: var(--color-error); }
.badge-medium { background: var(--color-warning); }
.badge-low { background: var(--color-success); }
.risk { font-size: 1.1rem; margin: 1rem 0 0.25rem; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; vertical-align: top; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--color-border); }
th { color: var(--color-muted); font-weight: 600; }
.summary { max-width: 36rem; }
.summary td:last-child { font-weight: 700; }
.steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 1rem; }
.steps li { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; padding: 1rem; }
code, pre { font-family: var(--font-mono); font-size: 0.9rem; }
pre {
  background: var(--color-surface-strong);
  color: var(--color-text);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0.5rem 0 0;
}
.filters { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 0.75rem; }
.filters button {
  font: inherit;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--color-control);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}
.filters button[aria-pressed="true"] { background: var(--color-surface-strong); font-weight: 700; }
.sort { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
.findings td:nth-child(2) { font-family: var(--font-mono); font-size: 0.9rem; overflow-wrap: anywhere; }
footer { margin-top: 3rem; color: var(--color-muted); }
@media (max-width: 40rem) {
  .findings th:nth-child(4), .findings td:nth-child(4) { display: none; }
}
@media print {
  .filters { display: none; }
}
`;
