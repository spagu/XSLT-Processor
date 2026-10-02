/**
 * Decimal formats of the static context (XPath 3.1 section 2.1.1), used by
 * fn:format-number. Formats are given by name: a lexical QName or an EQName
 * (prefixes resolved with the static namespaces), "" for the default one.
 *
 * Properties are read in camelCase (`decimalSeparator`) or as the
 * attribute names of xsl:decimal-format (`decimal-separator`, `NaN`).
 *
 * @module @tradik/xslt3/xpath/eval/decimalFormats
 */

/** Property names of a decimal format, by attribute name. */
const PROPERTIES = {
  "decimal-separator": "decimalSeparator",
  "grouping-separator": "groupingSeparator",
  "exponent-separator": "exponentSeparator",
  infinity: "infinity",
  "minus-sign": "minusSign",
  NaN: "nan",
  nan: "nan",
  percent: "percent",
  "per-mille": "perMille",
  "zero-digit": "zeroDigit",
  digit: "digit",
  "pattern-separator": "patternSeparator",
};
const CAMEL = new Set(Object.values(PROPERTIES));

/**
 * The properties of a format definition.
 * @param {object} definition
 * @returns {object} camelCase properties
 */
function propertiesOf(definition) {
  const properties = {};
  for (const [key, value] of Object.entries(definition)) {
    const name = PROPERTIES[key] ?? (CAMEL.has(key) ? key : null);
    if (name) properties[name] = value;
  }
  return properties;
}

/**
 * Expanded name of a format definition: a prefix declared on the
 * definition itself (an `xmlns:p` property, as xsl:decimal-format
 * elements have) comes first, then the static namespaces.
 * @param {string} name
 * @param {object} definition
 * @param {(name: string) => string} expand
 * @returns {string|null} Clark name, "" for the default format, null when
 *   the prefix is not declared
 */
function definitionKey(name, definition, expand) {
  if (name === "") return "";
  const colon = name.indexOf(":");
  const own =
    colon > 0 && !name.startsWith("Q{")
      ? definition[`xmlns:${name.slice(0, colon)}`]
      : undefined;
  if (own !== undefined) return `{${own}}${name.slice(colon + 1)}`;
  try {
    return expand(name);
  } catch {
    return null;
  }
}

/**
 * Builds the decimal formats of a static context.
 * @param {Array<object>|object|Map|undefined} formats - An array of
 *   definitions with a `name` property (absent for the default format),
 *   or definitions by name
 * @param {(name: string) => string} expand - Expands a name as written
 *   to a Clark name (throws for an undeclared prefix)
 * @returns {{get: (name: string) => object|undefined}} the formats by
 *   name (surrounding whitespace ignored); get() returns undefined for an
 *   unknown name or prefix
 */
export function createDecimalFormats(formats, expand) {
  const entries = Array.isArray(formats)
    ? formats.map((format) => [format.name ?? "", format])
    : formats instanceof Map
      ? [...formats]
      : Object.entries(formats ?? {});
  const byName = new Map();
  for (const [name, format] of entries) {
    const key = definitionKey(name.trim(), format, expand);
    if (key !== null) byName.set(key, propertiesOf(format));
  }
  return {
    get: (name) => byName.get(definitionKey(name.trim(), {}, expand)),
  };
}
