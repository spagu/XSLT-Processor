import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SERVER_SIDE_PACKAGES,
  parseManifest,
  serverSidePackages,
} from "./manifest.js";

describe("serverSidePackages", () => {
  it("lists known XSLT packages from every dependency field", () => {
    const text = JSON.stringify({
      dependencies: { "saxon-js": "^2", express: "^4" },
      devDependencies: { xslt3: "^2" },
      peerDependencies: { "@tradik/xslt-processor": "^1" },
      optionalDependencies: { libxslt: "^0.10" },
    });
    assert.deepEqual(serverSidePackages(text), [
      "@tradik/xslt-processor",
      "saxon-js",
      "libxslt",
      "xslt3",
    ]);
  });

  it("returns an empty list without package.json, with invalid JSON or no deps", () => {
    for (const text of [
      undefined,
      null,
      "{ not json",
      '{"name":"x"}',
      "null",
    ]) {
      assert.deepEqual(serverSidePackages(text), []);
    }
    assert.deepEqual(parseManifest("3"), {});
  });

  it("adds xsltproc when an npm script runs it", () => {
    const text = JSON.stringify({
      scripts: { build: "xsltproc -o out.html t.xsl in.xml", test: "node t" },
    });
    assert.deepEqual(serverSidePackages(text), ["xsltproc"]);
  });

  it("knows the usual server-side packages", () => {
    assert.ok(SERVER_SIDE_PACKAGES.includes("xsltproc"));
    assert.ok(SERVER_SIDE_PACKAGES.includes("xslt-processor"));
  });
});
