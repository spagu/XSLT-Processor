/**
 * Test helpers of the online check page under jsdom: the layout's <main> as
 * a page, waiting for the page, a FileSystemEntry tree for a dropped folder
 * and a drop. Holds no tests of its own.
 *
 * @module check-page-helpers
 */

import assert from "node:assert/strict";
import { File } from "node:buffer";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM, VirtualConsole } from "jsdom";

/**
 * A page with the layout's <main> and the given checker URL; its window
 * and document become the globals the page scripts use.
 *
 * @param {string} main - The layout's <main> element, as a template
 * @param {string} checker - URL of the vendor bundle
 * @returns {Document} The page
 */
export function openPage(main, checker) {
  const html = main
    .replaceAll("{{ .Page.Title }}", "Check")
    .replaceAll("{{ .Page.Content | safeHTML }}", "")
    .replaceAll("{{ $b }}/vendor/migrate-check.browser.min.js", checker)
    .replaceAll("{{ $b }}", "");
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`, {
    virtualConsole: new VirtualConsole(),
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom.window.document;
}

/**
 * Wait until a condition holds (the page works asynchronously).
 *
 * Polls one step at a time (recursion instead of an awaiting loop).
 *
 * @param {() => boolean} condition - The condition
 * @param {number} [tries] - Polls left, 5 ms apart
 * @returns {Promise<void>} Resolves when it holds; fails after 2 s
 */
export async function until(condition, tries = 400) {
  if (condition()) return;
  assert.ok(tries > 0, "timed out");
  await delay(5);
  await until(condition, tries - 1);
}

/**
 * A FileSystemEntry tree of files below a folder.
 *
 * @param {string} name - Folder name
 * @param {Record<string, string>} files - Path to text
 * @returns {object} The directory entry
 */
export function folderEntry(name, files) {
  const children = new Map();
  for (const [path, text] of Object.entries(files)) {
    const [head, ...rest] = path.split("/");
    if (rest.length === 0) {
      children.set(head, {
        isFile: true,
        isDirectory: false,
        name: head,
        file: (resolve) => resolve(new File([text], head)),
      });
    } else {
      const sub = children.get(head)?.files ?? {};
      sub[rest.join("/")] = text;
      children.set(head, { files: sub });
    }
  }
  const entries = [...children].map(([child, value]) =>
    value.files ? folderEntry(child, value.files) : value,
  );
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      // Two batches, then the empty one that ends the listing
      const batches = [entries.slice(0, 2), entries.slice(2), []];
      return { readEntries: (resolve) => resolve(batches.shift()) };
    },
  };
}

/**
 * Drag over the drop zone, leave it, and drop items on it.
 *
 * @param {Document} doc - The page
 * @param {object[]} items - DataTransfer items
 * @returns {void}
 */
export function drop(doc, items) {
  const view = doc.defaultView;
  const zone = doc.getElementById("ck-drop");
  zone.dispatchEvent(new view.Event("dragover"));
  assert.ok(zone.classList.contains("ck-drop--over"));
  zone.dispatchEvent(new view.Event("dragleave"));
  const event = new view.Event("drop");
  event.dataTransfer = { items };
  zone.dispatchEvent(event);
}
