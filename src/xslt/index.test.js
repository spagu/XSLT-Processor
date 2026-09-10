/**
 * XSLT module entry point tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import * as xslt from "./index.js";

describe("xslt module exports", () => {
  it("should expose the engine and the XSLT helpers", () => {
    for (const name of [
      "XsltEngine",
      "XsltContext",
      "createXsltFunctions",
      "KeyIndexRegistry",
      "formatNumber",
      "countXsltNumber",
      "formatXsltNumber",
      "toRoman",
      "WhitespaceFilter",
      "stripWhitespaceNodes",
      "NamespaceAliasMap",
      "createResultDocument",
      "importResultFragment",
      "importResultNode",
      "resolveUri",
      "stripFragment",
      "isAbsoluteUri",
      "isXsltElementAvailable",
      "getXsltAttribute",
      "lookupNamespaceUri",
      "shouldCopyAttribute",
    ]) {
      assert.strictEqual(typeof xslt[name], "function", name);
    }

    assert.strictEqual(
      xslt.XSLT_NAMESPACE,
      "http://www.w3.org/1999/XSL/Transform",
    );
    assert.ok(xslt.XSLT_ELEMENTS.includes("apply-imports"));
    assert.strictEqual(xslt.DEFAULT_DECIMAL_FORMAT.percent, "%");
    assert.strictEqual(typeof xslt.VENDOR, "string");
    assert.strictEqual(typeof xslt.VENDOR_URL, "string");
  });
});
