/**
 * XSLT element vocabulary tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  XSLT_ELEMENTS,
  XSLT_NAMESPACE,
  isXsltElementAvailable,
} from "./elements.js";

describe("elements", () => {
  it("should expose the XSLT namespace", () => {
    assert.strictEqual(XSLT_NAMESPACE, "http://www.w3.org/1999/XSL/Transform");
  });

  it("should report every listed element as available", () => {
    for (const name of XSLT_ELEMENTS) {
      assert.strictEqual(isXsltElementAvailable(name), true, name);
    }
  });

  it("should report unknown elements as unavailable", () => {
    assert.strictEqual(isXsltElementAvailable("result-document"), false);
  });
});
