import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  createFixture,
  removeFixture,
  renderedXml,
  scanResult,
  stylesheetXml,
} from "../test/fixtures.js";
import { buildScan } from "./analyze.js";
import { isFile, readWalked, scanDirectory } from "./scan.js";

/** The scan of one file that holds nothing. */
const emptyResult = () => scanResult({ scannedFiles: 1 });

describe("inspectFile", () => {
  let dir;

  before(async () => {
    dir = await createFixture({
      "app.js": "const p = new XSLTProcessor();\np.importStylesheet(x);\n",
      "quiet.js": "console.log('nothing');\n",
      "done.js": "import '@tradik/xslt-processor';\nnew XSLTProcessor();\n",
      "style.xsl": stylesheetXml("2.0"),
      "embedded.xml": stylesheetXml("1.0"),
      "feed.xml": renderedXml(),
      "data.xml": "<data/>",
      "notes.md": "XSLTProcessor is mentioned in prose\n",
      "loaded.xml": `${renderedXml()}<!-- @tradik/xslt-processor -->\n`,
    });
  });

  after(() => removeFixture(dir));

  /** Read one fixture file and scan it alone. */
  async function inspect(name) {
    const file = await readWalked({
      path: join(dir, name),
      relativePath: name,
    });
    return buildScan([file], { exists: () => false });
  }

  it("records script usages with their lines", async () => {
    const { usages } = await inspect("app.js");
    assert.deepEqual(usages, [
      {
        file: "app.js",
        line: 1,
        text: "const p = new XSLTProcessor();",
        method: "XSLTProcessor",
      },
      {
        file: "app.js",
        line: 2,
        text: "p.importStylesheet(x);",
        method: "importStylesheet",
      },
    ]);
  });

  it("records nothing for a script without usages", async () => {
    assert.deepEqual(await inspect("quiet.js"), emptyResult());
  });

  it("files already migrated go to the migrated list", async () => {
    const result = await inspect("done.js");
    assert.deepEqual(result.usages, []);
    assert.deepEqual(result.migrated, [{ file: "done.js", count: 1 }]);
  });

  it("describes .xsl stylesheets and .xml files with a stylesheet root", async () => {
    assert.equal((await inspect("style.xsl")).stylesheets[0].version, "2.0");
    const embedded = (await inspect("embedded.xml")).stylesheets[0];
    assert.equal(embedded.file, "embedded.xml");
    assert.equal(embedded.version, "1.0");
  });

  it("records XML documents rendered with xml-stylesheet", async () => {
    const { xmlDocuments } = await inspect("feed.xml");
    assert.deepEqual(xmlDocuments, [
      { file: "feed.xml", line: 2, href: "style.xsl", type: "text/xsl" },
    ]);
  });

  it("counts a rendered document with the loader as migrated", async () => {
    const result = await inspect("loaded.xml");
    assert.deepEqual(result.xmlDocuments, []);
    assert.deepEqual(result.migrated, [{ file: "loaded.xml", count: 1 }]);
    assert.equal(isFile(join(dir, "loaded.xml")), true);
    assert.equal(isFile(dir), false);
  });

  it("ignores other XML and unrelated extensions", async () => {
    assert.deepEqual(await inspect("data.xml"), emptyResult());
    assert.deepEqual(await inspect("notes.md"), emptyResult());
  });
});

describe("scanDirectory", () => {
  it("counts files, honours ignore and reads package.json", async () => {
    const dir = await createFixture({
      "package.json": JSON.stringify({ dependencies: { "saxon-js": "^2" } }),
      "src/app.js": "new XSLTProcessor()",
      "legacy/old.js": "new XSLTProcessor()",
      "node_modules/x/index.js": "new XSLTProcessor()",
      "xsl/a.xsl": stylesheetXml("1.0"),
      "feeds/rss.xml": renderedXml(),
    });
    try {
      const result = await scanDirectory(dir, { ignore: ["legacy"] });
      assert.equal(result.scannedFiles, 4);
      assert.deepEqual(
        result.usages.map((u) => u.file),
        ["src/app.js"],
      );
      assert.equal(result.stylesheets.length, 1);
      assert.equal(result.xmlDocuments.length, 1);
      assert.deepEqual(result.serverSide, ["saxon-js"]);
      const all = await scanDirectory(dir);
      assert.equal(all.scannedFiles, 5);
    } finally {
      await removeFixture(dir);
    }
  });
});

describe("scanDirectory context", () => {
  it("records DOMParser context and checks include targets", async () => {
    const dir = await createFixture({
      "app.js": "const d = new DOMParser();\nnew XSLTProcessor();\n",
      "xsl/main.xsl": stylesheetXml(
        "1.0",
        '<xsl:import href="base.xsl"/><xsl:include href="gone.xsl"/>',
      ),
      "xsl/base.xsl": stylesheetXml("1.0"),
    });
    try {
      const result = await scanDirectory(dir);
      assert.deepEqual(result.domParser, [
        { file: "app.js", line: 1, text: "const d = new DOMParser();" },
      ]);
      const main = result.stylesheets.find((s) => s.file === "xsl/main.xsl");
      assert.deepEqual(
        main.includes.map((i) => [i.href, i.found]),
        [
          ["base.xsl", true],
          ["gone.xsl", false],
        ],
      );
    } finally {
      await removeFixture(dir);
    }
  });
});
