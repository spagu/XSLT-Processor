/**
 * In-page helpers of the browser tests.
 *
 * The same functions drive the library and the native XSLTProcessor, so the
 * differential test serializes both results in exactly the same way.
 */

/**
 * Parse an XML string with the page's DOMParser.
 *
 * @param {string} text - XML source
 * @returns {Document} Parsed document
 * @throws {Error} When the text is not well-formed
 */
export function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("XML parse error");
  }
  return doc;
}

/**
 * Serialize a result node the way a page would read it back.
 *
 * Every node goes through XMLSerializer (a fragment child by child), so the
 * namespace of each element shows up: an HTML element is written with the
 * XHTML namespace, an XML element in no namespace without one.
 *
 * @param {Node|null} node - Transformation result
 * @returns {string|null} Serialized markup, or null for a null result
 */
export function serializeNode(node) {
  if (node === null || node === undefined) return null;
  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return [...node.childNodes].map((child) => serializeNode(child)).join("");
  }
  return new XMLSerializer().serializeToString(node);
}

/**
 * Run one transformation.
 *
 * @param {Function} Processor - XSLTProcessor constructor (library or native)
 * @param {object} testCase - Case to run
 * @param {string} testCase.xml - Source document
 * @param {string} testCase.xsl - Stylesheet
 * @param {Object<string, string|number|boolean>} [testCase.params] - Top-level
 *   parameters, set with setParameter(null, name, value)
 * @param {"fragment"|"document"|"string"} mode - API method to call
 * @returns {{output: string|null, error: string|null}} Serialized result or
 *   the message of the error thrown
 */
export function runCase(Processor, testCase, mode) {
  try {
    const processor = new Processor();
    processor.importStylesheet(parseXml(testCase.xsl));
    for (const [name, value] of Object.entries(testCase.params ?? {})) {
      processor.setParameter(null, name, value);
    }
    const source = parseXml(testCase.xml);
    let output;
    if (mode === "fragment") {
      output = serializeNode(processor.transformToFragment(source, document));
    } else if (mode === "document") {
      output = serializeNode(processor.transformToDocument(source));
    } else {
      output = processor.transformToString(source);
    }
    return { output, error: null };
  } catch (error) {
    return { output: null, error: String(error?.message ?? error) };
  }
}

/**
 * Fetch text files of the fixture directory (for the synchronous loaders).
 *
 * @param {string[]} paths - Paths relative to this module
 * @returns {Promise<Map<string, string>>} Text by path
 */
export async function fetchTexts(paths) {
  const texts = new Map();
  for (const path of paths) {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    texts.set(path, await response.text());
  }
  return texts;
}
