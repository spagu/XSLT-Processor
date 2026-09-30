/**
 * The template registry: registration of xsl:template, default priorities,
 * and the choice of the template rule or named template to instantiate.
 *
 * Methods installed on XsltEngine.prototype (`this` is the engine).
 */

import { calculatePriority } from "../templatePriority.js";
import { inScopeNamespaces } from "../stylesheetNamespaces.js";
import { requireExpandedName } from "../declarationNames.js";
import { checkLocalBindings, checkPattern } from "../stylesheetChecks.js";

/**
 * Split a pattern on the `|` operators that are not inside a predicate or a
 * string literal.
 *
 * @param {string} pattern - The match pattern
 * @returns {string[]} The alternatives, untrimmed; a trailing empty one is
 *   dropped
 */
export function splitUnionPattern(pattern) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = "";

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "[") {
      depth++;
    } else if (char === "]") {
      depth--;
    } else if (char === "|" && depth === 0) {
      parts.push(pattern.slice(start, i));
      start = i + 1;
    }
  }

  if (start < pattern.length) parts.push(pattern.slice(start));
  return parts;
}

/**
 * Whether a template rule may be chosen for a mode below an import
 * precedence limit.
 *
 * @param {object} template - The template record
 * @param {string|null} mode - The mode
 * @param {number} maxImportPrecedence - Exclusive import precedence limit
 * @returns {boolean} True when the template is a candidate
 */
function isCandidateRule(template, mode, maxImportPrecedence) {
  return (
    template.mode === mode &&
    Boolean(template.match) &&
    (template.importPrecedence || 0) < maxImportPrecedence
  );
}

/**
 * Whether a matching template rule wins over the best one so far: a higher
 * import precedence wins; on equal precedence a priority that is not lower
 * wins, so the last template in stylesheet order wins ties (the XSLT 1.0
 * section 5.5 recovery, as in libxslt).
 *
 * @param {object} template - The matching template
 * @param {object|null} best - The best template so far
 * @returns {boolean} True when `template` becomes the best one
 */
function outranks(template, best) {
  if (!best) return true;
  const precedence = template.importPrecedence || 0;
  const bestPrecedence = best.importPrecedence || 0;
  return (
    precedence > bestPrecedence ||
    (precedence === bestPrecedence && template.priority >= best.priority)
  );
}

export const templateRuleMethods = {
  /**
   * Register a template rule.
   *
   * A union match pattern is equivalent to a set of template rules, one per
   * alternative (XSLT 1.0 section 5.5), so each alternative is registered
   * separately with its own default priority.
   *
   * @param {Element} node - The xsl:template element
   * @returns {void}
   */
  registerTemplate(node) {
    const match = node.getAttribute("match");
    if (match !== null) {
      checkPattern(this.patternMatcher, match, "xsl:template match");
    }
    checkLocalBindings(node, (message) => this.warnOnce(message));
    const name = node.getAttribute("name");
    const nameKey = name === null ? null : this.namedTemplateKey(node, name);
    const mode = node.getAttribute("mode") || null;
    const priorityAttr = node.getAttribute("priority");
    const alternatives = match
      ? this.splitUnionPattern(match).map((p) => p.trim())
      : [null];

    const namespaces = inScopeNamespaces(node);
    for (const alternative of alternatives) {
      this.templates.push({
        match: alternative,
        name,
        nameKey,
        mode,
        namespaces,
        priority: priorityAttr
          ? parseFloat(priorityAttr)
          : this.calculatePriority(alternative),
        importPrecedence: this.currentImportPrecedence,
        node,
      });
    }
  },

  /**
   * Expand the name of a named template, rejecting a second template of the
   * same expanded name and import precedence (XSLT 1.0 section 6), as
   * libxslt does.
   *
   * @param {Element} node - The xsl:template element
   * @param {string} name - Its name attribute
   * @returns {string} The expanded name key
   * @throws {Error} When the name is invalid or already used
   */
  namedTemplateKey(node, name) {
    const key = requireExpandedName(name, node, "xsl:template name");
    const duplicate = this.templates.some(
      (template) =>
        template.nameKey === key &&
        template.importPrecedence === this.currentImportPrecedence,
    );
    if (duplicate) {
      throw new Error(
        `xsl:template: duplicate template name "${name}" at the same import precedence (XSLT 1.0 section 6)`,
      );
    }
    return key;
  },

  /**
   * Default priority of a single match pattern (see templatePriority.js).
   *
   * @param {string|null} matchPattern - The match pattern
   * @returns {number} The default priority
   */
  calculatePriority(matchPattern) {
    return calculatePriority(matchPattern ? matchPattern.trim() : matchPattern);
  },

  /**
   * Split a union pattern into its alternatives (see splitUnionPattern).
   *
   * @param {string} pattern - The match pattern
   * @returns {string[]} The alternatives
   */
  splitUnionPattern(pattern) {
    return splitUnionPattern(pattern);
  },

  /**
   * Find the best matching template rule for a node (XSLT 1.0 section 5.5).
   * Every candidate's pattern is tested, in stylesheet order.
   *
   * @param {Node} node - The node to process
   * @param {string|null} mode - The mode
   * @param {XsltContext} context - Context supplying variables
   * @param {number} [maxImportPrecedence] - Only templates of a lower import
   *   precedence are considered (xsl:apply-imports)
   * @returns {object|null} The template, or null for the built-in rules
   */
  findMatchingTemplate(node, mode, context, maxImportPrecedence = Infinity) {
    let best = null;
    for (const template of this.templates) {
      if (
        isCandidateRule(template, mode, maxImportPrecedence) &&
        this.matchesPattern(
          node,
          template.match,
          context,
          template.namespaces,
        ) &&
        outranks(template, best)
      ) {
        best = template;
      }
    }
    return best;
  },

  /**
   * Find the named template with the highest import precedence; among equal
   * precedences the last one in stylesheet order wins.
   *
   * @param {string} key - Expanded name of the template (see
   *   declarationNames.js)
   * @returns {object|null} The template, or null when none has that name
   */
  findNamedTemplate(key) {
    let best = null;
    for (const template of this.templates) {
      if (
        template.nameKey === key &&
        (!best ||
          (template.importPrecedence || 0) >= (best.importPrecedence || 0))
      ) {
        best = template;
      }
    }
    return best;
  },

  /**
   * Check whether a node matches an XSLT pattern (see patterns.js).
   *
   * Errors raised while evaluating a predicate make the pattern not match,
   * as before the compiled matcher existed.
   *
   * @param {Node} node - The candidate node
   * @param {string} pattern - The XSLT pattern
   * @param {XsltContext|null} context - Context supplying variables and namespaces
   * @param {Object<string, string>} [namespaces] - Prefixes in scope on the
   *   element holding the pattern, when they differ from the context's
   * @returns {boolean} Whether the node matches
   */
  matchesPattern(node, pattern, context, namespaces) {
    try {
      return this.patternMatcher.matches(node, pattern, context, namespaces);
    } catch {
      return false;
    }
  },
};
