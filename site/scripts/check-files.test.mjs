// The online check's file reading: the unzip without a library and the
// collection of what the analysis reads (caps, binary files, top folder).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { TextDecoder, TextEncoder } from "node:util";
import {
  collectFiles,
  commonFolder,
  decodeText,
  isZip,
  LIMITS,
} from "../templates/xslt-site/js/check-files.js";
import {
  listZipEntries,
  readEntry,
  unreadableReason,
} from "../templates/xslt-site/js/check-unzip.js";
import { isAnalysed } from "../../packages/migrate-check/src/analyze.js";
import { createIgnoreMatcher } from "../../packages/migrate-check/src/ignore.js";
import { makeZip } from "./zip-fixture.mjs";

const text = (bytes) => new TextDecoder().decode(bytes);
const XSL =
  '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"/>';

describe("unzip", () => {
  it("lists and reads stored and deflated entries", async () => {
    const zip = makeZip(
      [
        { name: "app/", data: "" },
        { name: "app/a.xsl", data: XSL },
        { name: "app/b.js", data: "new XSLTProcessor()", method: "store" },
      ],
      { comment: "made by a test" },
    );
    const entries = listZipEntries(new Uint8Array(zip));
    assert.deepEqual(
      entries.map((e) => [e.name, e.method, e.directory]),
      [
        ["app/", 8, true],
        ["app/a.xsl", 8, false],
        ["app/b.js", 0, false],
      ],
    );
    assert.equal(text(await readEntry(zip, entries[1])), XSL);
    assert.equal(text(await readEntry(zip, entries[2])), "new XSLTProcessor()");
  });

  it("refuses what it cannot read", async () => {
    assert.throws(() => listZipEntries(new Uint8Array(10)), /not a zip/);
    assert.throws(() => listZipEntries(new Uint8Array(100)), /not a zip/);
    const zip = makeZip([
      { name: "secret.xml", data: "<a/>", encrypted: true },
      { name: "bz.xml", data: "<a/>", method: 12 },
      { name: "short.xml", data: "<a/>", size: 99 },
      { name: "short-stored.xml", data: "<a/>", method: "store", size: 99 },
    ]);
    const entries = listZipEntries(zip);
    assert.equal(unreadableReason(entries[0]), "encrypted");
    assert.match(unreadableReason(entries[1]), /method 12/);
    await assert.rejects(readEntry(zip, entries[0]), /encrypted/);
    await assert.rejects(readEntry(zip, entries[2]), /damaged entry/);
    await assert.rejects(readEntry(zip, entries[3]), /damaged entry/);
    const broken = { ...entries[2], localOffset: 3 };
    await assert.rejects(readEntry(zip, broken), /damaged/);
    const junk = makeZip([
      {
        name: "junk.xml",
        data: new Uint8Array([255, 255, 255, 255]),
        method: "store",
      },
    ]);
    const [stored] = listZipEntries(junk);
    await assert.rejects(
      readEntry(junk, { ...stored, method: 8 }),
      /damaged entry/,
    );
  });

  it("rejects ZIP64 and damaged central directories", () => {
    const zip = makeZip([{ name: "a.xml", data: "<a/>" }]);
    const zip64 = Buffer.from(zip);
    zip64.writeUInt32LE(0xffffffff, zip64.length - 6);
    assert.throws(() => listZipEntries(zip64), /ZIP64/);
    const big = Buffer.from(zip);
    big.writeUInt32LE(0xffffffff, zip.length - 22 - 5 - 46 + 24);
    assert.throws(() => listZipEntries(big), /ZIP64/);
    const damaged = Buffer.from(zip);
    damaged.writeUInt32LE(0, zip.length - 22 - 5 - 46);
    assert.throws(() => listZipEntries(damaged), /damaged/);
  });
});

describe("collecting files", () => {
  const source = (path, content) => {
    const bytes =
      typeof content === "string" ? new TextEncoder().encode(content) : content;
    return { path, size: bytes.length, read: async () => bytes };
  };
  const options = { isAnalysed, isIgnoredDir: createIgnoreMatcher() };

  it("decodes text and recognises binary files and archives", () => {
    assert.equal(decodeText(new TextEncoder().encode("﻿<a/>")), "<a/>");
    assert.equal(decodeText(new Uint8Array([60, 0, 62])), null);
    assert.equal(isZip("Site.ZIP"), true);
    assert.equal(isZip("a.xml"), false);
    assert.equal(commonFolder(["p/a", "p/b/c"]), "p");
    assert.equal(commonFolder(["p/a", "q/b"]), "");
    assert.equal(commonFolder(["a"]), "");
    assert.equal(commonFolder([]), "");
  });

  it("takes off the top folder and leaves out what the CLI skips", async () => {
    const collected = await collectFiles(
      [
        source("site/package.json", "{}"),
        source("site/a.xsl", XSL),
        source("site/node_modules/x/b.js", "new XSLTProcessor()"),
        source("site/logo.png", new Uint8Array([1, 2])),
        source("site/img.svg.xml", new Uint8Array([60, 0])),
        {
          path: "site/gone.js",
          size: 1,
          read: () => Promise.reject(new Error("gone")),
        },
      ],
      options,
    );
    assert.equal(collected.folder, "site");
    assert.deepEqual(
      collected.files.map((f) => f.path),
      ["package.json", "a.xsl"],
    );
    assert.equal(collected.notRead, 2);
    assert.deepEqual(collected.skipped, [
      { path: "img.svg.xml", reason: "binary" },
      { path: "gone.js", reason: "gone" },
    ]);
  });

  it("opens zip archives and reports unreadable ones", async () => {
    const zip = makeZip([
      { name: "p/", data: "" },
      { name: "p/a.xsl", data: XSL },
      { name: "p/s.xml", data: "<a/>", encrypted: true },
    ]);
    const collected = await collectFiles(
      [source("p.zip", zip), source("bad.zip", "not a zip")],
      options,
    );
    assert.deepEqual(collected.files, [{ path: "a.xsl", text: XSL }]);
    assert.deepEqual(collected.skipped, [
      { path: "bad.zip", reason: "not a zip archive" },
      { path: "s.xml", reason: "encrypted" },
    ]);
  });

  it("enforces the caps", async () => {
    const limits = { ...LIMITS, maxBytes: 10, maxFiles: 1 };
    const two = [source("a.xsl", "1"), source("b.xsl", "2")];
    await assert.rejects(
      collectFiles(two, { ...options, limits }),
      /More than 1 files/,
    );
    const big = [source("a.xsl", "x".repeat(11))];
    await assert.rejects(
      collectFiles(big, { ...options, limits }),
      /larger than 0 MB/,
    );
    const zip = [source("a.zip", "x".repeat(11))];
    await assert.rejects(
      collectFiles(zip, { ...options, limits }),
      /larger than/,
    );
    assert.equal(LIMITS.maxBytes, 50 * 1024 * 1024);
    assert.equal(LIMITS.maxFiles, 5000);
  });
});
