/**
 * Which test cases apply to @tradik/xslt3: the dependency declarations of
 * both catalogs checked against a configuration of what the processor
 * supports. The defaults describe the target of docs/XSLT3.md: a basic
 * (non schema-aware, non streaming) XSLT 3.0 processor with XPath 3.1.
 *
 * @module test-suites/lib/dependencies
 */

/**
 * @typedef {object} SuiteConfig
 * @property {Record<string, number>} specs - Spec family to supported
 *   version, e.g. `{XP: 31}`; "XQ" is absent, so XQuery-only tests drop out
 * @property {Record<string, boolean>} features - Feature name to support
 *   (unknown features count as unsupported)
 * @property {Record<string, string[]>} values - Other dependency types to the
 *   values supported, e.g. `{"xml-version": ["1.0"]}`
 * @property {string[]} collations - Collation URIs environments may declare
 */

/** Unicode codepoint collation, the only one required by the specs. */
export const CODEPOINT_COLLATION =
  "http://www.w3.org/2005/xpath-functions/collation/codepoint";

/**
 * Dependency values shared by both suites (types named as in each catalog).
 */
const SHARED_VALUES = {
  "xml-version": ["1.0", "1.0:5+"],
  "xsd-version": ["1.1"],
  language: ["en"],
  "default-language": ["en"],
  languages_for_numbering: ["en"],
  default_language_for_numbering: ["en"],
  "unicode-normalization-form": ["NFC", "NFD", "NFKC", "NFKD"],
  additional_normalization_form: [
    "support NFD",
    "support NFKC",
    "support NFKD",
  ],
  "unicode-version": [],
  "format-integer-sequence": [],
  calendar: ["AD", "ISO"],
  supported_calendars_in_date_formatting_functions: ["AD", "ISO"],
  default_calendar_in_date_formatting_functions: ["AD"],
  limits: [],
  year_component_values: [],
  default_output_encoding: ["UTF-8"],
  unparsed_text_encoding: ["UTF-8"],
  default_html_version: ["5"],
  "on-multiple-match": ["error"],
};

/**
 * Build the configuration of a suite.
 *
 * @param {"qt3"|"xslt30"} suite - Suite name
 * @param {object} [options] - Options
 * @param {boolean} [options.xpath10Compatibility] - Run the XPath 1.0
 *   compatibility mode / XSLT backwards-compatibility tests (default false)
 * @param {Record<string, boolean>} [options.features] - Feature overrides
 * @returns {SuiteConfig} The configuration
 */
export function createConfig(
  suite,
  { xpath10Compatibility = false, features = {} } = {},
) {
  const base =
    suite === "qt3"
      ? {
          specs: { XP: 31, XT: 30 },
          features: {
            higherOrderFunctions: true,
            "namespace-axis": true,
            "collection-stability": true,
            "xpath-1.0-compatibility": xpath10Compatibility,
            moduleImport: false,
            schemaImport: false,
            schemaValidation: false,
            schemaAware: false,
            staticTyping: false,
            typedData: false,
            serialization: false,
          },
        }
      : {
          specs: { XSLT: 30 },
          features: {
            higher_order_functions: true,
            namespace_axis: true,
            "XPath_3.1": true,
            "XSD_1.1": true,
            backwards_compatibility: xpath10Compatibility,
            schema_aware: false,
            streaming: false,
            serialization: false,
          },
        };
  return {
    specs: base.specs,
    features: { ...base.features, ...features },
    values: SHARED_VALUES,
    collations: [CODEPOINT_COLLATION],
  };
}

/**
 * Whether one spec token (e.g. "XP30+", "XQ10", "XSLT20+") is supported.
 *
 * @param {string} token - Spec token
 * @param {Record<string, number>} specs - Supported versions per family
 * @returns {boolean} True when the processor's version matches
 */
export function specTokenSupported(token, specs) {
  const match = /^([A-Z]+?)(\d+)(\+?)$/.exec(token);
  if (!match) return false;
  const [, family, version, plus] = match;
  const supported = specs[family];
  if (supported === undefined) return false;
  return plus ? supported >= Number(version) : supported === Number(version);
}

/**
 * Whether the processor has a dependency, before `satisfied` is applied.
 *
 * @param {import('./qt3Catalog.mjs').Dependency} dependency - Dependency
 * @param {SuiteConfig} config - Configuration
 * @returns {boolean} True when supported
 */
export function hasDependency({ type, value }, config) {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (type === "spec") {
    return tokens.some((t) => specTokenSupported(t, config.specs));
  }
  if (type === "feature") return config.features[value] === true;
  const values = config.values[type];
  if (!values) return false;
  return (
    values.includes(value) || tokens.some((token) => values.includes(token))
  );
}

/**
 * Effective dependencies of a test case: those of its test set and its own,
 * where a test case's `spec` dependency replaces the test set's.
 *
 * @param {import('./qt3Catalog.mjs').Dependency[]} setDependencies - Set level
 * @param {import('./qt3Catalog.mjs').Dependency[]} caseDependencies - Own
 * @returns {import('./qt3Catalog.mjs').Dependency[]} Combined list
 */
export function effectiveDependencies(setDependencies, caseDependencies) {
  const ownSpec = caseDependencies.some((dep) => dep.type === "spec");
  const inherited = ownSpec
    ? setDependencies.filter((dep) => dep.type !== "spec")
    : setDependencies;
  return [...inherited, ...caseDependencies];
}

/**
 * Why an environment cannot be provided, if it cannot: schema validated
 * documents, schemas, or collations other than the codepoint collation.
 *
 * @param {import('./environment.mjs').Environment|null} environment - Env
 * @param {SuiteConfig} config - Configuration
 * @returns {string} Reason, empty when the environment is supported
 */
export function environmentProblem(environment, config) {
  if (!environment) return "";
  const sources = [
    ...environment.sources,
    ...environment.collections.flatMap((collection) => collection.sources),
  ];
  const validated = sources.find(
    (s) => s.validation === "strict" || s.validation === "lax",
  );
  if (validated) return `schema validation (${validated.validation})`;
  const collation = environment.collations.find(
    (c) => !config.collations.includes(c.uri),
  );
  if (collation) return `collation ${collation.uri}`;
  return "";
}

/**
 * Decide whether a test case applies.
 *
 * @param {object} testCase - Test case with `dependencies` and `environment`
 * @param {import('./qt3Catalog.mjs').Dependency[]} setDependencies - Set level
 * @param {SuiteConfig} config - Configuration
 * @returns {{applicable: boolean, reason: string}} The decision and, when not
 *   applicable, the first unmet dependency
 */
export function applicability(testCase, setDependencies, config) {
  for (const dep of effectiveDependencies(
    setDependencies,
    testCase.dependencies,
  )) {
    if (hasDependency(dep, config) !== dep.satisfied) {
      const negation = dep.satisfied ? "" : "not ";
      return {
        applicable: false,
        reason: `${negation}${dep.type} ${dep.value}`.trim(),
      };
    }
  }
  const problem = environmentProblem(testCase.environment, config);
  return { applicable: problem === "", reason: problem };
}
