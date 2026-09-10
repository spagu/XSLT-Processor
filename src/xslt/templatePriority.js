/**
 * Default template priorities (XSLT 1.0 section 5.5).
 *
 * A template rule without an explicit `priority` attribute gets a default
 * priority derived from the shape of its match pattern. A union pattern is
 * treated as a set of template rules, one per alternative, so each
 * alternative must be assigned its own priority by the caller.
 *
 * @module xslt/templatePriority
 */

const NAME = String.raw`[A-Za-z_][\w.-]*`;
const QNAME = `(?:${NAME}:)?${NAME}`;

/** Patterns of the form `name`, `prefix:name`, `@name`, `@prefix:name`. */
const QNAME_PATTERN = new RegExp(`^(?:child::|attribute::|@)?${QNAME}$`);

/** Patterns of the form `prefix:*` or `@prefix:*`. */
const PREFIX_WILDCARD_PATTERN = new RegExp(
  String.raw`^(?:child::|attribute::|@)?${NAME}:\*$`,
);

/** Patterns of the form `*`, `@*`, `node()`, `text()`, `comment()`, `processing-instruction()`. */
const NODE_TEST_PATTERN =
  /^(?:child::|attribute::|@)?(?:\*|node\(\)|text\(\)|comment\(\)|processing-instruction\(\))$/;

/** `processing-instruction('literal')` patterns. */
const PI_LITERAL_PATTERN =
  /^(?:child::)?processing-instruction\(\s*(?:"[^"]*"|'[^']*')\s*\)$/;

/**
 * Compute the default priority of a single (non-union) match pattern.
 *
 * @param {string|null|undefined} pattern - The match pattern, already trimmed
 * @returns {number} -0.5, -0.25, 0 or 0.5 as defined by the specification
 */
export function calculatePriority(pattern) {
  if (!pattern) return 0.5;

  if (NODE_TEST_PATTERN.test(pattern)) return -0.5;
  if (PREFIX_WILDCARD_PATTERN.test(pattern)) return -0.25;
  if (QNAME_PATTERN.test(pattern) || PI_LITERAL_PATTERN.test(pattern)) return 0;

  return 0.5;
}
