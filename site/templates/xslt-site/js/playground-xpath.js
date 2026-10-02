/**
 * Page wiring of the playground's XPath 3.1 mode: the expression, variable
 * and namespace editors, and the result list (one row per item with its
 * type and value). The evaluation itself is in xpath-core.js.
 *
 * @tradik/xslt3 is loaded on the first evaluation (playground-library.js),
 * so the XSLT 1.0 mode never downloads it.
 *
 * @module playground-xpath
 */

import { libraryRunner } from "./playground-library.js";
import { evaluate } from "./xpath-core.js";
import { xpathPresets } from "./xpath-presets.js";

/**
 * Build the XPath 3.1 mode.
 *
 * @param {object} page - Elements and helpers shared with the page
 * @param {ReturnType<import("./playground-library.js").lazyImport>} page.library
 *   - Loads @tradik/xslt3
 * @param {HTMLTextAreaElement} page.xmlInput - The XML source editor
 * @param {HTMLElement} page.statusLine - Status line (a live region)
 * @param {(messages: { level: string, text: string, code?: string }[]) => void} page.showMessages
 *   - Fills the message list
 * @param {() => boolean} page.isActive - Whether XPath 3.1 is still the
 *   current mode once the library has loaded
 * @returns {{ presets: object[], loadPreset: (id: string) => void, run: () => Promise<void> }}
 *   The mode
 */
export function createXPathMode({
  library,
  xmlInput,
  statusLine,
  showMessages,
  isActive,
}) {
  const $ = (id) => document.getElementById(id);
  const exprInput = $("pg-expr");
  const varsInput = $("pg-vars");
  const nsInput = $("pg-ns");
  const itemList = $("pg-items");
  const withLibrary = libraryRunner({
    library,
    statusLine,
    showMessages,
    isActive,
  });

  /**
   * Show an evaluation result: the item list and a status line with the
   * count and the time, or the error with its code.
   *
   * @param {import("./xpath-core.js").XPathResult} result - The result
   * @param {object} lib - @tradik/xslt3
   */
  function show(result, lib) {
    const rows = (result.items ?? []).map(({ type, value }, index) => {
      const row = document.createElement("li");
      row.className = "pg-item";
      const label = document.createElement("span");
      label.className = "pg-item__type";
      label.textContent = type;
      const pre = document.createElement("pre");
      pre.className = "pg-item__value";
      pre.tabIndex = 0;
      pre.setAttribute("aria-label", `Item ${index + 1}, ${type}`);
      const code = document.createElement("code");
      code.textContent = value;
      pre.append(code);
      row.append(label, pre);
      return row;
    });
    itemList.replaceChildren(...rows);
    if (result.error) {
      statusLine.textContent = "The evaluation failed. See the message below.";
      showMessages([
        {
          level: "error",
          code: result.error.code ?? undefined,
          text: result.error.message,
        },
      ]);
      return;
    }
    const count = result.items.length;
    const items =
      count === 0 ? "Empty sequence" : `${count} item${count === 1 ? "" : "s"}`;
    statusLine.textContent = `${items} in ${result.ms.toFixed(1)} ms with @tradik/xslt3 ${lib.VERSION} (in development).`;
    showMessages([]);
  }

  /** Evaluate the current expression and show the result. */
  function run() {
    return withLibrary((lib) =>
      show(
        evaluate(
          {
            xml: xmlInput.value,
            expression: exprInput.value,
            variables: varsInput.value,
            namespaces: nsInput.value,
          },
          { lib, DOMParser, XMLSerializer, now: () => performance.now() },
        ),
        lib,
      ),
    );
  }

  /**
   * Load an example into the editors and run it.
   *
   * @param {string} id - Preset id
   */
  function loadPreset(id) {
    const preset = xpathPresets.find((p) => p.id === id) ?? xpathPresets[0];
    xmlInput.value = preset.xml;
    exprInput.value = preset.expression;
    varsInput.value = preset.variables;
    nsInput.value = preset.namespaces;
    void run(); // run() reports its own errors on the page
  }

  return { presets: xpathPresets, loadPreset, run };
}
