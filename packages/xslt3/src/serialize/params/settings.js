/**
 * Normalized serialization settings: the parameters given to the API
 * (camelCase or hyphenated names) converted, defaulted and checked for the
 * conflicts of Serialization 3.1 (SEPM0009, SEPM0010) and the values this
 * serializer does not support (SESU0007, SESU0011, SESU0013).
 *
 * @module @tradik/xslt3/serialize/params/settings
 */

import { XPathError } from "../../errors.js";
import { resolveEncoding } from "../output/encoding.js";
import { PARAMETER_KINDS, toCamelCase, toHyphenated } from "./names.js";
import { CONVERTERS } from "./values.js";

/**
 * @typedef {object} Settings
 * @property {string} method
 * @property {boolean} allowDuplicateNames
 * @property {boolean} byteOrderMark - Default: yes for UTF-16 only
 * @property {Set<string>} cdataSectionElements - Clark names
 * @property {string} [doctypePublic]
 * @property {string} [doctypeSystem]
 * @property {import("../output/encoding.js").Encoding} encoding
 * @property {boolean} escapeUriAttributes
 * @property {number} htmlVersion - 5 or 4 (html and xhtml methods)
 * @property {boolean} includeContentType
 * @property {boolean} indent
 * @property {string} [itemSeparator]
 * @property {string} jsonNodeOutputMethod
 * @property {string} mediaType
 * @property {string} normalizationForm - "none", "NFC", "NFD", "NFKC", "NFKD"
 * @property {boolean} omitXmlDeclaration
 * @property {"yes"|"no"|"omit"} standalone
 * @property {Set<string>} suppressIndentation - Clark names
 * @property {boolean} undeclarePrefixes
 * @property {Map<string, string>|null} useCharacterMaps
 * @property {string} version - XML version (xml and xhtml methods)
 */

/** Defaults of the parameters that have one (camelCase names). */
const DEFAULTS = Object.freeze({
  method: "xml",
  allowDuplicateNames: false,
  cdataSectionElements: new Set(),
  encoding: "UTF-8",
  escapeUriAttributes: true,
  includeContentType: true,
  indent: false,
  jsonNodeOutputMethod: "xml",
  normalizationForm: "none",
  omitXmlDeclaration: false,
  standalone: "omit",
  suppressIndentation: new Set(),
  undeclarePrefixes: false,
  useCharacterMaps: null,
});

const NORMALIZATION_FORMS = new Set(["NFC", "NFD", "NFKC", "NFKD", "none"]);

/**
 * Converts the given parameters (undefined values are absent).
 * @param {Record<string, *>} params
 * @returns {Record<string, *>} converted values by camelCase name
 */
function convert(params) {
  const values = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const hyphenated = key.includes("-") ? key : toHyphenated(key);
    const kind = PARAMETER_KINDS[hyphenated];
    if (!kind) continue;
    values[toCamelCase(hyphenated)] = CONVERTERS[kind](hyphenated, value);
  }
  return values;
}

/**
 * The HTML version requested for the html and xhtml methods: html-version,
 * else (html method) version, else 5.
 * @param {Record<string, *>} values - Converted values
 * @returns {number} 4 or 5
 * @throws {XPathError} SESU0013 for other versions
 */
function htmlVersionOf(values) {
  let version = values.htmlVersion;
  if (version === undefined && values.method === "html" && values.version) {
    version = CONVERTERS.decimal("version", values.version);
  }
  if (version === undefined || version === 5) return 5;
  if (version === 4 || version === 4.01) return 4;
  throw new XPathError("SESU0013", `Unsupported HTML version ${version}`);
}

/**
 * Checks the XML-related parameters of the xml and xhtml methods.
 * @param {Settings} settings
 * @throws {XPathError} SESU0013, SEPM0009 or SEPM0010
 */
function checkXml(settings) {
  const { version, omitXmlDeclaration, standalone } = settings;
  if (version !== "1.0" && version !== "1.1") {
    throw new XPathError("SESU0013", `Unsupported XML version ${version}`);
  }
  if (omitXmlDeclaration && standalone !== "omit") {
    throw new XPathError(
      "SEPM0009",
      "standalone conflicts with omit-xml-declaration",
    );
  }
  if (omitXmlDeclaration && version !== "1.0" && settings.doctypeSystem) {
    throw new XPathError(
      "SEPM0009",
      "doctype-system with XML 1.1 needs the XML declaration",
    );
  }
  if (settings.undeclarePrefixes && version === "1.0") {
    throw new XPathError("SEPM0010", "undeclare-prefixes needs XML 1.1");
  }
}

/**
 * Normalizes serialization parameters.
 * @param {Record<string, *>} [params] - Parameters by camelCase or
 *   hyphenated name (unknown names are ignored)
 * @returns {Settings}
 * @throws {XPathError} SEPM0016 for invalid values, SEPM0009/SEPM0010 for
 *   conflicts, SESU0007/SESU0011/SESU0013 for unsupported values
 */
export function normalizeSettings(params = {}) {
  const values = { ...DEFAULTS, ...convert(params) };
  if (!NORMALIZATION_FORMS.has(values.normalizationForm)) {
    throw new XPathError(
      "SESU0011",
      `Unsupported normalization form ${values.normalizationForm}`,
    );
  }
  const htmlLike = values.method === "html" || values.method === "xhtml";
  const settings = {
    ...values,
    encoding: resolveEncoding(values.encoding),
    byteOrderMark: values.byteOrderMark ?? /^utf-?16$/i.test(values.encoding),
    htmlVersion: htmlLike ? htmlVersionOf(values) : 5,
    mediaType: values.mediaType ?? "text/html",
    version: values.method === "html" ? "1.0" : (values.version ?? "1.0"),
  };
  if (settings.method === "xml" || settings.method === "xhtml") {
    checkXml(settings);
  }
  return settings;
}
