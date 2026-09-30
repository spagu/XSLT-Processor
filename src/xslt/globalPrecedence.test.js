/**
 * A global xsl:param and xsl:variable of the same name: the declaration with
 * the higher import precedence wins (XSLT 1.0 section 11.4); at the same
 * precedence the xsl:variable is used (with a warning, see
 * stylesheetChecks.test.js).
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { run, stylesheet } from "./harness.test.js";

const VALUE =
  '<xsl:template match="/"><xsl:value-of select="$g"/></xsl:template>';

/**
 * Run a main stylesheet importing `lib.xsl`.
 *
 * @param {string} main - Top-level declarations of the main stylesheet
 * @param {string} lib - Top-level declarations of the imported one
 * @param {Object<string, *>} [params] - External parameter values
 * @returns {string} The result
 */
const withImport = (main, lib, params = {}) =>
  run(stylesheet(`<xsl:import href="lib.xsl"/>${main}${VALUE}`), "<d/>", {
    imports: { "http://x/lib.xsl": stylesheet(lib) },
    params,
  });

describe("global param and variable of the same name", () => {
  it("uses an importing xsl:param over an imported xsl:variable", () => {
    const main = '<xsl:param name="g" select="\'param\'"/>';
    const lib = '<xsl:variable name="g" select="\'variable\'"/>';
    assert.strictEqual(withImport(main, lib), "param");
    assert.strictEqual(withImport(main, lib, { g: "outside" }), "outside");
  });

  it("uses an importing xsl:variable over an imported xsl:param", () => {
    const main = '<xsl:variable name="g" select="\'variable\'"/>';
    const lib = '<xsl:param name="g" select="\'param\'"/>';
    assert.strictEqual(withImport(main, lib), "variable");
    assert.strictEqual(withImport(main, lib, { g: "outside" }), "variable");
  });

  it("uses a variable over an external value without xsl:param", () => {
    assert.strictEqual(
      run(stylesheet(`<xsl:variable name="g" select="'v'"/>${VALUE}`), "<d/>", {
        params: { g: "outside" },
      }),
      "v",
    );
  });
});
