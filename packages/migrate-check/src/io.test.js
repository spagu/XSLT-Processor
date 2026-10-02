import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { createProcessIo, directoryLabel, ignoreBrokenPipe } from "./io.js";

describe("helpers", () => {
  it("directoryLabel adds the trailing slash", () => {
    assert.equal(directoryLabel("."), "./");
    assert.equal(directoryLabel("site/templates"), "site/templates/");
    assert.equal(directoryLabel("site/"), "site/");
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
