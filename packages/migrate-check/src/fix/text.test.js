import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bomLength,
  eolOf,
  indentOf,
  insertAt,
  lineStart,
  splitLines,
} from "./text.js";

describe("fix text helpers", () => {
  it("detects line ends and byte order marks", () => {
    assert.equal(eolOf("a\r\nb"), "\r\n");
    assert.equal(eolOf("a\nb"), "\n");
    assert.equal(bomLength("ï»¿x"), 3);
    assert.equal(bomLength("﻿x"), 1);
    assert.equal(bomLength("x"), 0);
  });

  it("splits lines keeping their ends", () => {
    assert.deepEqual(splitLines("a\r\nb\nc"), ["a\r\n", "b\n", "c"]);
    assert.deepEqual(splitLines("a\n"), ["a\n"]);
    assert.deepEqual(splitLines(""), []);
  });

  it("reads indentation, line starts and inserts", () => {
    assert.equal(indentOf("\t  x"), "\t  ");
    assert.equal(lineStart("ab\ncd", 4), 3);
    assert.equal(lineStart("ab", 1), 0);
    assert.equal(insertAt("ac", 1, "b"), "abc");
  });
});
