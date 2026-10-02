import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_REFERENCE, chooseReference } from "./select.js";

const engine = {
  name: "Chromium",
  transform: async () => "",
  close: async () => {},
};

/** Dependencies with Playwright and xsltproc present or not. */
function deps({
  playwright = null,
  testRunner = null,
  xsltproc = null,
  launch,
} = {}) {
  return {
    load: async (name) =>
      name === "@playwright/test" ? testRunner : playwright,
    detect: async () => xsltproc,
    launch: launch ?? (async () => engine),
  };
}

describe("chooseReference", () => {
  it("prefers Chromium, then xsltproc, then none", async () => {
    assert.equal(
      (await chooseReference("auto", ".", deps({ testRunner: {} }))).name,
      "Chromium",
    );
    assert.equal(
      (await chooseReference("auto", ".", deps({ playwright: {} }))).name,
      "Chromium",
    );
    assert.equal(
      (await chooseReference("auto", ".", deps({ xsltproc: "xsltproc" }))).name,
      "xsltproc",
    );
    const none = await chooseReference("auto", ".", deps());
    assert.equal(none.name, NO_REFERENCE);
    assert.equal(none.transform, null);
    await none.close();
  });

  it("falls back with a note when Chromium does not start", async () => {
    const failing = deps({
      playwright: {},
      xsltproc: "xsltproc",
      launch: () => Promise.reject(new Error("no binary\nmore")),
    });
    const reference = await chooseReference("auto", ".", failing);
    assert.equal(reference.name, "xsltproc");
    assert.deepEqual(reference.notes, [
      "Chromium did not start (no binary); using the next engine.",
    ]);
  });

  it("honours an explicit choice and fails when it is missing", async () => {
    assert.equal(
      (await chooseReference("none", ".", deps({ xsltproc: "x" }))).name,
      NO_REFERENCE,
    );
    assert.equal(
      (
        await chooseReference(
          "xsltproc",
          ".",
          deps({ playwright: {}, xsltproc: "x" }),
        )
      ).name,
      "x",
    );
    await assert.rejects(
      chooseReference("xsltproc", ".", deps()),
      /xsltproc is not on PATH/,
    );
    await assert.rejects(
      chooseReference("browser", ".", deps({ xsltproc: "x" })),
      /--browser needs @playwright\/test/,
    );
    await assert.rejects(
      chooseReference(
        "browser",
        ".",
        deps({
          playwright: {},
          launch: () => Promise.reject(new Error("boom")),
        }),
      ),
      /cannot start Chromium: boom/,
    );
  });
});
