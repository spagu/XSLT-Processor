import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RUNTIME_RANGES,
  addDependencies,
  locate,
  missingDependencies,
} from "./packageJson.js";

const LIB = "@tradik/xslt-processor";
const XSLT3 = "@tradik/xslt3";

describe("addDependencies", () => {
  it("appends to existing dependencies, keeping order and indent", () => {
    const text =
      '{\n    "name": "x",\n    "dependencies": {\n        "a": "^1"\n    },\n    "scripts": {}\n}\n';
    assert.equal(
      addDependencies(text, [LIB, XSLT3]),
      text.replace(
        '"a": "^1"\n',
        `"a": "^1",\n        "${LIB}": "${RUNTIME_RANGES[LIB]}",\n        "${XSLT3}": "^1.0.0"\n`,
      ),
    );
  });

  it("fills an empty dependencies object, with CRLF", () => {
    const text =
      '{\r\n  "dependencies": {},\r\n  "x": [1, {"y": "}"}]\r\n}\r\n';
    assert.equal(
      addDependencies(text, [LIB]),
      text.replace("{},", `{\r\n    "${LIB}": "^1.3.3"\r\n  },`),
    );
  });

  it("adds a dependencies object at the end, or to an empty manifest", () => {
    // A name with an escaped quote: {\n  "name": "a\"b"\n}
    const quoted = JSON.stringify({ name: 'a"b' }, null, 2);
    assert.equal(
      addDependencies(`${quoted}\n`, [LIB]),
      `${quoted.slice(0, -2)},\n  "dependencies": {\n    "${LIB}": "^1.3.3"\n  }\n}\n`,
    );
    assert.equal(
      addDependencies("{}", [LIB]),
      `{\n  "dependencies": {\n    "${LIB}": "^1.3.3"\n  }\n}`,
    );
  });

  it("returns null when everything is declared or the file is not an object", () => {
    const text = JSON.stringify({ devDependencies: { [LIB]: "1" } });
    assert.equal(addDependencies(text, [LIB]), null);
    assert.deepEqual(missingDependencies(text, [LIB, XSLT3]), [XSLT3]);
    assert.equal(addDependencies("[]", [LIB]), null);
    const bom = `\u00EF\u00BB\u00BF${text}`;
    assert.equal(addDependencies(bom, [LIB]), null);
    assert.equal(locate('{"a": 1').rootEnd, -1);
  });
});
