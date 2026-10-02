import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUGGESTION } from "../migration.js";
import { addCdnScript } from "./html.js";

const TAG = SUGGESTION.script;

describe("addCdnScript", () => {
  it("goes before the first script in <head>, on its own line", () => {
    const page =
      '<html>\n  <head>\n    <title>x</title>\n    <script src="a.js"></script>\n  </head>\n</html>\n';
    assert.equal(
      addCdnScript(page),
      page.replace("    <script", `    ${TAG}\n    <script`),
    );
  });

  it("goes inline before a script that shares its line", () => {
    const page = "<head><title>x</title><script></script></head>";
    assert.equal(
      addCdnScript(page),
      `<head><title>x</title>${TAG}<script></script></head>`,
    );
  });

  it("goes right after <head> without a script, with the child indent", () => {
    const page =
      '<html>\r\n<head lang="en">\r\n  <title>x</title>\r\n</head>\r\n<script></script>\r\n';
    assert.equal(
      addCdnScript(page),
      page.replace('<head lang="en">', `<head lang="en">\r\n  ${TAG}`),
    );
  });

  it("indents under an empty head and handles a head on one line", () => {
    assert.equal(
      addCdnScript("  <head>\n  </head>\n"),
      `  <head>\n    ${TAG}\n  </head>\n`,
    );
    assert.equal(
      addCdnScript("<head><meta></head>"),
      `<head>${TAG}<meta></head>`,
    );
    assert.equal(addCdnScript("<HEAD>\n"), `<HEAD>\n  ${TAG}\n`);
  });

  it("returns null without <head>", () => {
    assert.equal(addCdnScript("<body><script></script></body>"), null);
  });
});
