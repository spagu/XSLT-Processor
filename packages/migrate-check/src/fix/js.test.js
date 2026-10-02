import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POLYFILL_IMPORT_LINE,
  POLYFILL_REQUIRE_LINE,
  addPolyfill,
  moduleStyle,
  prologueEnd,
} from "./js.js";

const IMPORT = POLYFILL_IMPORT_LINE;

describe("moduleStyle", () => {
  it("decides by extension, syntax and package type", () => {
    assert.equal(moduleStyle("a.ts", "", undefined), "module");
    assert.equal(moduleStyle("a.cjs", "", undefined), "commonjs");
    assert.equal(moduleStyle("a.vue", "", "module"), null);
    assert.equal(
      moduleStyle("a.js", 'import x from "y";', undefined),
      "module",
    );
    assert.equal(moduleStyle("a.js", "export { a };", undefined), "module");
    assert.equal(
      moduleStyle("a.js", 'const x = require("y");', undefined),
      "commonjs",
    );
    assert.equal(
      moduleStyle("a.js", "new XSLTProcessor();", "module"),
      "module",
    );
    assert.equal(moduleStyle("a.js", "new XSLTProcessor();", "commonjs"), null);
  });
});

describe("addPolyfill", () => {
  it("adds the import as the first line of a plain module", () => {
    assert.equal(
      addPolyfill('import a from "a";\n', "module"),
      `${IMPORT}\nimport a from "a";\n`,
    );
  });

  it("goes after the shebang, use strict and the license block", () => {
    const text = [
      "#!/usr/bin/env node",
      "/**",
      " * License",
      " */",
      "// note",
      "/* one line */",
      "",
      '"use strict";',
      'const x = require("x");',
      "",
    ].join("\n");
    const result = addPolyfill(text, "commonjs");
    assert.equal(
      result,
      text.replace(
        'const x = require("x");',
        `${POLYFILL_REQUIRE_LINE}\nconst x = require("x");`,
      ),
    );
  });

  it("keeps CRLF and the byte order mark", () => {
    const bom = "ï»¿";
    assert.equal(
      addPolyfill(`${bom}// c\r\nrun();\r\n`, "module"),
      `${bom}// c\r\n${IMPORT}\r\nrun();\r\n`,
    );
  });

  it("handles files that are only a prologue", () => {
    assert.equal(addPolyfill("// only", "module"), `// only\n${IMPORT}\n`);
    assert.equal(addPolyfill("// only\n", "module"), `// only\n${IMPORT}\n`);
    assert.equal(addPolyfill("", "module"), `${IMPORT}\n`);
    assert.equal(prologueEnd("#!/bin/node"), "#!/bin/node".length);
  });
});
