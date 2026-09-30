/**
 * Conformance runner - output decoding and normalisation.
 *
 * The expected outputs are the bytes xsltproc wrote. Only differences that
 * are serialisation choices rather than transformation results are
 * normalised away:
 * - CR LF and lone CR line endings become LF;
 * - the XML declaration is rebuilt from its pseudo-attributes, so
 *   `<?xml version="1.0"?>` (libxslt leaves out the default UTF-8 encoding)
 *   equals `<?xml version="1.0" encoding="UTF-8"?>`, and encoding labels
 *   compare case-insensitively; an output that is nothing but a declaration
 *   counts as empty (libxslt writes no bytes for an empty result tree);
 * - attributes and namespace declarations of a start tag are sorted
 *   (their order carries no meaning in XML or HTML);
 * - the HTML `<meta http-equiv="Content-Type" content="...; charset=X">`
 *   element (XSLT 1.0 section 16.2) equals the `<meta charset="X">` form
 *   current libxml2 versions write;
 * - whitespace at the very end of the output (libxslt ends XML output with a
 *   newline);
 * - with `markupWhitespace`, whitespace-only runs between two tags are
 *   removed. The runner enables it for indented output (`indent="yes"`, the
 *   default of the HTML method), where the serializer may add or remove such
 *   whitespace (XSLT 1.0 sections 16.1 and 16.2).
 * Everything else, including whitespace inside text content, is compared
 * verbatim.
 */

import { TextDecoder } from "node:util";

/** Matches a leading XML declaration and its trailing line break. */
const XML_DECLARATION = /^<\?xml\s([^?]*)\?>[ \t]*\n?/;

/** Matches one pseudo-attribute of an XML declaration. */
const PSEUDO_ATTRIBUTE = /([a-z]+)\s*=\s*(["'])(.*?)\2/g;

/** Encoding label of an XML declaration, in the first bytes of a file. */
const DECLARED_ENCODING = /^<\?xml\s[^>]*?\bencoding\s*=\s*(["'])([\w.:-]+)\1/;

/** Charset of an HTML `<meta>` element, in the first bytes of a file. */
const META_CHARSET = /<meta\b[^>]*?charset\s*=\s*["']?([\w.:-]+)/i;

/** A start tag whose attributes all have double quoted values. */
const START_TAG =
  /<([A-Za-z_][\w.:-]*)((?:\s+[^\s="'<>/]+="[^"]*")+)\s*(\/?)>/g;

/** One double quoted attribute of a start tag. */
const TAG_ATTRIBUTE = /[^\s="'<>/]+="[^"]*"/g;

/** The Content-Type `<meta>` element of the HTML output method. */
const CONTENT_TYPE_META =
  /<meta\s+(?:http-equiv="Content-Type"\s+content="[^"]*?charset=([^"]+)"|content="[^"]*?charset=([^"]+)"\s+http-equiv="Content-Type")\s*\/?>/gi;

/**
 * Decode an expected output file.
 *
 * The encoding is the one the file announces (XML declaration, else HTML
 * `<meta>` charset), else the given fallback (the xsl:output encoding),
 * else UTF-8. Labels TextDecoder does not know fall back to latin1, which
 * keeps every byte.
 *
 * @param {Uint8Array} bytes - Raw file content
 * @param {string|null} [fallback] - Encoding used when the file announces none
 * @returns {string} Decoded text
 */
export function decodeExpected(bytes, fallback = null) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  const label =
    DECLARED_ENCODING.exec(head)?.[2] ??
    META_CHARSET.exec(head)?.[1] ??
    fallback ??
    "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}

/**
 * Rebuild an XML declaration in a canonical form.
 *
 * @param {string} pseudoAttributes - Text between `<?xml` and `?>`
 * @returns {string} Canonical declaration followed by a line break
 *
 * @example
 * canonicalDeclaration(' version="1.0"'); // '<?xml version="1.0" encoding="UTF-8"?>\n'
 */
export function canonicalDeclaration(pseudoAttributes) {
  const values = {};
  for (const [, name, , value] of pseudoAttributes.matchAll(PSEUDO_ATTRIBUTE)) {
    values[name] = value;
  }
  const version = values.version ?? "1.0";
  const encoding = (values.encoding ?? "UTF-8").toUpperCase();
  const standalone = values.standalone
    ? ` standalone="${values.standalone}"`
    : "";
  return `<?xml version="${version}" encoding="${encoding}"${standalone}?>\n`;
}

/**
 * Sort the attributes of every start tag.
 *
 * @param {string} text - Serialized markup
 * @returns {string} Markup with sorted attributes
 *
 * @example
 * sortAttributes('<a y="1" x="2"/>'); // '<a x="2" y="1"/>'
 */
export function sortAttributes(text) {
  return text.replace(START_TAG, (_tag, name, attributes, empty) => {
    const sorted = attributes.match(TAG_ATTRIBUTE).sort();
    return `<${name} ${sorted.join(" ")}${empty}>`;
  });
}

/**
 * Normalise a serialized result for comparison.
 *
 * @param {string} text - Serialized result
 * @param {object} [options] - Options
 * @param {boolean} [options.markupWhitespace] - Remove whitespace-only runs
 *   between tags (indented output)
 * @returns {string} Normalised text
 *
 * @example
 * normalizeOutput('<?xml version="1.0"?>\r\n<a/>\n');
 * // '<?xml version="1.0" encoding="UTF-8"?>\n<a/>'
 */
export function normalizeOutput(text, { markupWhitespace = false } = {}) {
  let result = text.replace(/\r\n?/g, "\n");
  const declaration = XML_DECLARATION.exec(result);
  if (declaration) {
    const body = result.slice(declaration[0].length);
    if (body.trim() === "") return "";
    result = canonicalDeclaration(declaration[1]) + body;
  }
  result = result.replace(
    CONTENT_TYPE_META,
    (_meta, first, second) =>
      `<meta charset="${(first ?? second).toUpperCase()}">`,
  );
  result = result.replace(
    /<meta charset="([^"]+)">/gi,
    (_meta, charset) => `<meta charset="${charset.toUpperCase()}">`,
  );
  if (markupWhitespace) result = result.replace(/>\s+</g, "><");
  return sortAttributes(result).replace(/\s+$/, "");
}

/**
 * Describe the first difference between two strings.
 *
 * @param {string} expected - Normalised expected output
 * @param {string} actual - Normalised actual output
 * @param {number} [before] - Characters of context before the difference
 * @param {number} [after] - Characters of context from the difference on
 * @returns {{offset: number, expected: string, actual: string}|null}
 *   Excerpts around the first differing offset, null when equal
 */
export function firstDifference(expected, actual, before = 20, after = 100) {
  if (expected === actual) return null;
  let offset = 0;
  while (offset < expected.length && expected[offset] === actual[offset]) {
    offset++;
  }
  const start = Math.max(0, offset - before);
  return {
    offset,
    expected: expected.slice(start, offset + after),
    actual: actual.slice(start, offset + after),
  };
}
