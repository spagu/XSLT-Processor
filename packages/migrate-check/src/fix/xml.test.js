import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SUGGESTION } from "../migration.js";
import { addLoader, rootStart, tagEnd } from "./xml.js";

const TAG = SUGGESTION.xmlScript;

describe("addLoader", () => {
  it("adds the script as the first child, with the children's indent", () => {
    const doc =
      '<?xml version="1.0" encoding="ISO-8859-1"?>\n<?xml-stylesheet type="text/xsl" href="a.xsl"?>\n<!-- c > d -->\n<!DOCTYPE r [\n<!ENTITY e "x">\n]>\n<r a="1>2">\n    <item/>\n</r>\n';
    assert.equal(
      addLoader(doc),
      doc.replace('<r a="1>2">\n', `<r a="1>2">\n    ${TAG}\n`),
    );
  });

  it("keeps CRLF and the BOM; indents under an empty element", () => {
    const doc =
      'ï»¿<?xml version="1.0"?>\r\n<!DOCTYPE r SYSTEM "r.dtd">\r\n<r>\r\n</r>\r\n';
    assert.equal(addLoader(doc), doc.replace("<r>\r\n", `<r>\r\n  ${TAG}\r\n`));
  });

  it("opens a self-closing root and handles a root on one line", () => {
    assert.equal(
      addLoader("<root a='x' />\n"),
      `<root a='x'>\n  ${TAG}\n</root>\n`,
    );
    assert.equal(addLoader("<r><a/></r>"), `<r>${TAG}<a/></r>`);
  });

  it("returns null without a document element", () => {
    for (const text of [
      "",
      "text",
      "<?pi",
      "<!-- open",
      "<!DOCTYPE r [ <!ENTITY",
      "<!DOCTYPE r [ <!ENTITY e 'x'>",
      "<!DOCTYPE r [ ]",
      "<!DOCTYPE r",
      '<r a="x',
    ]) {
      assert.equal(addLoader(text), null, text);
    }
    assert.equal(rootStart("<?a?>"), -1);
    assert.equal(tagEnd("<r>", 0), 2);
  });
});
