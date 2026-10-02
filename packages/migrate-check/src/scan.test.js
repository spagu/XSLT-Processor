import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { HEAD_BYTES } from "./detectors.js";
import {
  createFixture,
  removeFixture,
  renderedXml,
  stylesheetXml,
} from "../test/fixtures.js";
import {
  SERVER_SIDE_PACKAGES,
  inspectFile,
  readHead,
  readServerSidePackages,
  scanDirectory,
} from "./scan.js";

/** A fresh, empty ScanResult. */
function emptyResult() {
  return {
    scannedFiles: 0,
    usages: [],
    stylesheets: [],
    xmlDocuments: [],
    migrated: [],
    serverSide: [],
  };
}

describe("readHead", () => {
  it("reads at most HEAD_BYTES", async () => {
    const dir = await createFixture({
      "small.xml": "<a/>",
      "big.xml": "x".repeat(HEAD_BYTES * 2),
    });
    try {
      assert.equal(await readHead(join(dir, "small.xml")), "<a/>");
      assert.equal((await readHead(join(dir, "big.xml"))).length, HEAD_BYTES);
    } finally {
      await removeFixture(dir);
    }
  });
});

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
    });
  });

  after(() => removeFixture(dir));

  /** Run inspectFile on one fixture file. */
  async function inspect(name) {
    const result = emptyResult();
    await inspectFile({ path: join(dir, name), relativePath: name }, result);
    return result;
  }

  it("records script usages with their lines", async () => {
    const { usages } = await inspect("app.js");
    assert.deepEqual(usages, [
      { file: "app.js", line: 1, text: "const p = new XSLTProcessor();" },
      { file: "app.js", line: 2, text: "p.importStylesheet(x);" },
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

  it("ignores other XML and unrelated extensions", async () => {
    assert.deepEqual(await inspect("data.xml"), emptyResult());
    assert.deepEqual(await inspect("notes.md"), emptyResult());
  });
});

describe("readServerSidePackages", () => {
  it("lists known XSLT packages from every dependency field", async () => {
    const dir = await createFixture({
      "package.json": JSON.stringify({
        dependencies: { "saxon-js": "^2", express: "^4" },
        devDependencies: { xslt3: "^2" },
        peerDependencies: { "@tradik/xslt-processor": "^1" },
        optionalDependencies: { libxslt: "^0.10" },
      }),
    });
    try {
      assert.deepEqual(await readServerSidePackages(dir), [
        "@tradik/xslt-processor",
        "saxon-js",
        "libxslt",
        "xslt3",
      ]);
    } finally {
      await removeFixture(dir);
    }
  });

  it("returns an empty list without package.json, with invalid JSON or no deps", async () => {
    const none = await createFixture({});
    const broken = await createFixture({ "package.json": "{ not json" });
    const bare = await createFixture({ "package.json": '{"name":"x"}' });
    try {
      assert.deepEqual(await readServerSidePackages(none), []);
      assert.deepEqual(await readServerSidePackages(broken), []);
      assert.deepEqual(await readServerSidePackages(bare), []);
    } finally {
      await Promise.all([none, broken, bare].map(removeFixture));
    }
  });

  it("knows the usual server-side packages", () => {
    assert.ok(SERVER_SIDE_PACKAGES.includes("xsltproc"));
    assert.ok(SERVER_SIDE_PACKAGES.includes("xslt-processor"));
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
