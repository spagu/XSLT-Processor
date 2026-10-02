import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import {
  createProcessIo,
  directoryLabel,
  ignoreBrokenPipe,
  toJson,
} from "./cli.js";
import { SUGGESTION } from "./migration.js";

describe("helpers", () => {
  it("directoryLabel adds the trailing slash", () => {
    assert.equal(directoryLabel("."), "./");
    assert.equal(directoryLabel("site/templates"), "site/templates/");
    assert.equal(directoryLabel("site/"), "site/");
  });

  it("toJson keeps the stable key order", () => {
    const json = toJson({
      version: "0.1.0",
      directory: "./",
      scannedFiles: 1,
      durationMs: 2,
      risk: "NONE",
      needsXslt3: false,
      msxml: false,
      usages: [],
      stylesheets: [],
      xmlDocuments: [],
      migrated: [],
      serverSide: [],
    });
    assert.equal("directory" in json, false);
    assert.equal(json.suggestion, SUGGESTION);
  });

  it("ignoreBrokenPipe swallows EPIPE and rethrows anything else", () => {
    const stream = new EventEmitter();
    ignoreBrokenPipe(stream);
    stream.emit("error", Object.assign(new Error("pipe"), { code: "EPIPE" }));
    assert.throws(
      () =>
        stream.emit(
          "error",
          Object.assign(new Error("disk"), { code: "ENOSPC" }),
        ),
      /disk/,
    );
  });

  it("createProcessIo writes to the process streams", () => {
    const io = createProcessIo();
    assert.equal(typeof io.isTTY, "boolean");
    io.write("");
    io.writeError("");
    assert.equal(typeof io.write, "function");
  });
});
