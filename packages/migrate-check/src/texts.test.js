import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUGGESTION } from "./migration.js";
import { FIXES, LINKS, POLYFILL_IMPORT, RECOMMENDATIONS } from "./texts.js";

describe("texts", () => {
  it("quotes the documented one-line fixes", () => {
    assert.equal(POLYFILL_IMPORT, 'import "@tradik/xslt-processor/polyfill";');
    assert.equal(RECOMMENDATIONS.polyfill.alternative, SUGGESTION.script);
    assert.equal(RECOMMENDATIONS.loader.snippet, SUGGESTION.xmlScript);
    assert.equal(RECOMMENDATIONS.loader.title, "Browser compatibility loader");
    assert.deepEqual(RECOMMENDATIONS.xslt3.commands, [
      "npm install @tradik/xslt-processor @tradik/xslt3",
    ]);
  });

  it("has a fix for every issue code and three https links", () => {
    for (const code of [
      "script",
      "xml-stylesheet",
      "xslt3",
      "document",
      "missing-include",
    ]) {
      assert.equal(typeof FIXES[code], "string");
    }
    assert.ok(Object.values(LINKS).every((url) => url.startsWith("https://")));
  });
});
