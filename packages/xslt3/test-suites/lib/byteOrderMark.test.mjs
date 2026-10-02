import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withByteOrderMark } from "./byteOrderMark.mjs";

describe("byte order marks", () => {
  it("start the text when byte-order-mark asks for one", () => {
    assert.equal(
      withByteOrderMark("<a/>", { "byte-order-mark": true }),
      "﻿<a/>",
    );
    assert.equal(withByteOrderMark("<a/>", {}), "<a/>");
    assert.equal(
      withByteOrderMark("<a/>", {
        "byte-order-mark": true,
        encoding: "iso-8859-1",
      }),
      "<a/>",
    );
  });
});
