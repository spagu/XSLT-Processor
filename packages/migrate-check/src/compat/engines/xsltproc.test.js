import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createXsltprocEngine, detectXsltproc } from "./xsltproc.js";
import { createFixture, removeFixture } from "../../../test/fixtures.js";
import { SAMPLE_PROJECT } from "../../../test/sample.js";

const installed = await detectXsltproc();

describe("detectXsltproc", () => {
  it("names xsltproc with its libxslt version, or returns null", async () => {
    const answer = (stdout) => async () => ({ stdout });
    assert.equal(
      await detectXsltproc(
        answer("Using libxml 21502, libxslt 10145 and libexslt 825"),
      ),
      "xsltproc (libxslt 10145)",
    );
    assert.equal(await detectXsltproc(answer("odd")), "xsltproc");
    assert.equal(
      await detectXsltproc(() => Promise.reject(new Error("ENOENT"))),
      null,
    );
  });
});

describe("the xsltproc engine", () => {
  it("passes parameters and the files, and reports xsltproc's message", async () => {
    const calls = [];
    const engine = createXsltprocEngine("xsltproc", async (file, args) => {
      calls.push([file, ...args]);
      return { stdout: "<r/>" };
    });
    assert.equal(
      await engine.transform(
        { xml: "a.xml", xsl: "a.xsl", params: { p: "1" } },
        "root",
      ),
      "<r/>",
    );
    assert.deepEqual(calls[0], [
      "xsltproc",
      "--stringparam",
      "p",
      "1",
      "root/a.xsl",
      "root/a.xml",
    ]);
    const failing = createXsltprocEngine("xsltproc", async () => {
      throw Object.assign(new Error("Command failed"), {
        stderr: "l1\nl2\nl3\nl4\n",
      });
    });
    await assert.rejects(
      failing.transform({ xml: "a", xsl: "b", params: {} }, "."),
      { message: "l1 l2 l3" },
    );
    const bare = createXsltprocEngine("xsltproc", () =>
      Promise.reject(new Error("spawn E")),
    );
    await assert.rejects(
      bare.transform({ xml: "a", xsl: "b", params: {} }, "."),
      { message: "spawn E" },
    );
    await engine.close();
  });

  it(
    "runs the real xsltproc on the sample project",
    { skip: !installed && "no xsltproc" },
    async () => {
      const dir = await createFixture(SAMPLE_PROJECT);
      try {
        const engine = createXsltprocEngine(installed);
        const output = await engine.transform(
          { xml: "public/invoice.xml", xsl: "styles/invoice.xsl", params: {} },
          dir,
        );
        assert.match(output, /<total>123\.00<\/total>/);
      } finally {
        await removeFixture(dir);
      }
    },
  );
});
