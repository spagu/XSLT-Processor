/**
 * Tests of case discovery and case execution against a tiny on-disk corpus
 * laid out like libxslt's `tests/` directory.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverCases, discoverDirectory } from "./cases.mjs";
import { classify } from "./classify.mjs";
import { runCase } from "./runCase.mjs";

const XSL = 'xmlns:xsl="http://www.w3.org/1999/XSL/Transform"';

/** Files of the fixture corpus, relative to its `tests/` directory. */
const FILES = {
  "REC/test-1-1.xsl": `<xsl:stylesheet version="1.0" ${XSL}><xsl:template match="/"><r><xsl:value-of select="$test"/></r></xsl:template><xsl:param name="test"/></xsl:stylesheet>`,
  "REC/test-1-1.xml": "<doc/>",
  "REC/test-1-1.out": '<?xml version="1.0"?>\n<r>passed_value</r>\n',
  "REC/inc-only.xsl": `<xsl:stylesheet version="1.0" ${XSL}/>`,
  "REC/stand-2.7-1.xml": `<?xml-stylesheet type="text/xml" href="#s"?><doc><xsl:stylesheet id="s" version="1.0" ${XSL}><xsl:template match="/"><ok/></xsl:template></xsl:stylesheet></doc>`,
  "REC/stand-2.7-1.stand.out": '<?xml version="1.0"?>\n<ok/>\n',
  "REC/stand-2.7-2.xml":
    '<?xml-stylesheet type="text/xml" href="stand-2.7-2.xsl"?><doc/>',
  "REC/stand-2.7-2.xsl": `<xsl:stylesheet version="1.0" ${XSL}><xsl:template match="/"><file/></xsl:template></xsl:stylesheet>`,
  "REC/stand-2.7-3.xml": "<doc/>",
  "REC/stand-2.7-4.xml":
    '<?xml-stylesheet type="text/xml" href="#missing"?><doc/>',
  "general/bad.xsl": `<xsl:stylesheet version="1.0" ${XSL}><xsl:template match="/"><xsl:value-of select="1 +"/></xsl:template></xsl:stylesheet>`,
  "general/bad.xml": "<doc/>",
  "general/bad.err": "compilation error: bad expression\n",
  "general/quiet.xsl": `<xsl:stylesheet version="1.0" ${XSL}><xsl:template match="/"><xsl:message>hi</xsl:message></xsl:template></xsl:stylesheet>`,
  "general/quiet.xml": "<doc/>",
  "general/quiet.err": "hi\n",
  "general/broken.xsl": "<xsl:stylesheet",
  "general/broken.xml": "<doc/>",
  "general/broken.out": "x",
};

let testsDir;

before(() => {
  testsDir = join(mkdtempSync(join(tmpdir(), "conformance-")), "tests");
  for (const [path, content] of Object.entries(FILES)) {
    mkdirSync(join(testsDir, path, ".."), { recursive: true });
    writeFileSync(join(testsDir, path), content);
  }
});

after(() => rmSync(join(testsDir, ".."), { recursive: true, force: true }));

/**
 * Find a discovered case by id.
 *
 * @param {string} id - Case id
 * @returns {object} The case
 */
function caseById(id) {
  return discoverCases(testsDir).find((testCase) => testCase.id === id);
}

describe("discovery", () => {
  it("follows the runtest.c rules", () => {
    assert.deepEqual(
      discoverCases(testsDir).map((testCase) => testCase.id),
      [
        "REC/stand-2.7-1#stand",
        "REC/stand-2.7-2",
        "REC/stand-2.7-2#stand",
        "REC/stand-2.7-3#stand",
        "REC/stand-2.7-4#stand",
        "REC/test-1-1",
        "general/bad",
        "general/broken",
        "general/quiet",
      ],
    );
    assert.deepEqual(discoverDirectory(testsDir, "missing"), []);
  });

  it("tells rejected cases from empty results", () => {
    assert.equal(caseById("general/bad").expectsError, true);
    assert.equal(caseById("general/quiet").expectsError, false);
    assert.equal(caseById("REC/test-1-1").category, "REC §1");
  });
});

describe("runCase", () => {
  it("passes the runtest parameters", async () => {
    const testCase = caseById("REC/test-1-1");
    const outcome = await runCase(testCase, testsDir);
    assert.equal(classify(testCase, outcome).status, "pass");
    assert.equal(outcome.indented, false);
  });

  it("runs embedded and referenced standalone stylesheets", async () => {
    const embedded = caseById("REC/stand-2.7-1#stand");
    assert.equal(
      classify(embedded, await runCase(embedded, testsDir)).status,
      "pass",
    );
    const referenced = await runCase(
      caseById("REC/stand-2.7-2#stand"),
      testsDir,
    );
    assert.match(referenced.output, /<file\/>/);
  });

  it("reports missing stylesheets of standalone cases", async () => {
    const noPi = await runCase(caseById("REC/stand-2.7-3#stand"), testsDir);
    assert.match(noPi.error, /No xml-stylesheet/);
    const missing = await runCase(caseById("REC/stand-2.7-4#stand"), testsDir);
    assert.match(missing.error, /not found/);
  });

  it("captures diagnostics and failures", async () => {
    const quiet = await runCase(caseById("general/quiet"), testsDir);
    assert.ok(quiet.diagnostics.some((line) => line.includes("hi")));
    const bad = caseById("general/bad");
    assert.equal(classify(bad, await runCase(bad, testsDir)).status, "pass");
    const broken = await runCase(caseById("general/broken"), testsDir);
    assert.equal(broken.output, null);
    assert.match(broken.error, /Error parsing stylesheet/);
  });
});
