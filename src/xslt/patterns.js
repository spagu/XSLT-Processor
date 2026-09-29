/**
 * XSLT 1.0 pattern matching (section 5.2).
 *
 * A pattern is a union of location path patterns. Each alternative is an
 * absolute or relative location path that only uses the child and attribute
 * axes and the `/` and `//` separators, optionally anchored on an `id()` or
 * `key()` call. Patterns are parsed once with the XPath parser and the
 * compiled form is cached per pattern string.
 *
 * Matching runs right to left: the node is tested against the last step, then
 * its parent (for `/`) or any ancestor (for `//`) against the previous step.
 * This costs O(depth) per node instead of evaluating the pattern as an
 * expression from the parent, which is O(siblings) and made
 * `xsl:apply-templates` quadratic in the number of children.
 *
 * Predicates follow the "position in the context of the parent" rule: a
 * predicate is evaluated with the node's position among its siblings that
 * pass the step's node test and the preceding predicates. That sibling list is
 * only built when the predicate uses `position()`/`last()` or evaluates to a
 * number, and it is cached per parent until {@link PatternMatcher#reset}.
 *
 * @module xslt/patterns
 */

import { childAxis } from "../xpath/axes.js";
import { ROOT, compilePattern } from "./patternCompiler.js";
import {
  MatchScope,
  isNamespaceDeclaration,
  isRoot,
  isStaticAnchor,
  parentOf,
  rootOf,
} from "./matchScope.js";

export { compilePattern };

/**
 * Matches nodes against XSLT patterns with an XPath evaluator.
 */
export class PatternMatcher {
  /**
   * @param {import('../xpath/evaluator.js').XPathEvaluator} evaluator - Evaluator used for node tests, predicates and anchors
   */
  constructor(evaluator) {
    this.evaluator = evaluator;
    this.compiled = new Map();
    this.positions = new WeakMap();
    this.anchors = new WeakMap();
  }

  /**
   * Forget cached sibling positions and anchor node-sets, e.g. before a new
   * transformation (the source tree may have been modified in between).
   *
   * @returns {void}
   */
  reset() {
    this.positions = new WeakMap();
    this.anchors = new WeakMap();
  }

  /**
   * Compile a pattern, reusing the cached form.
   *
   * @param {string} pattern - The XSLT pattern
   * @returns {object[]} The compiled alternatives
   * @throws {Error} When the string is not a valid pattern (XSLT 1.0
   *   section 5.2); the message names the pattern
   */
  compile(pattern) {
    let compiled = this.compiled.get(pattern);
    if (!compiled) {
      try {
        compiled = compilePattern(pattern);
      } catch (error) {
        throw new Error(`Invalid pattern "${pattern}": ${error.message}`, {
          cause: error,
        });
      }
      this.compiled.set(pattern, compiled);
    }
    return compiled;
  }

  /**
   * Test whether a node matches a pattern.
   *
   * @param {Node} node - The candidate node
   * @param {string} pattern - The XSLT pattern
   * @param {object|null} [host] - XSLT context supplying variables and namespaces
   * @param {Object<string, string>} [namespaces] - Prefix bindings overriding the host's
   * @returns {boolean} True when the node matches any alternative
   *
   * @example
   * matcher.matches(titleElement, 'chapter/title', xsltContext); // true
   */
  matches(node, pattern, host = null, namespaces = undefined) {
    const scope = new MatchScope(host, namespaces);
    for (const alternative of this.compile(pattern)) {
      if (this.matchesAlternative(node, alternative, scope)) return true;
    }
    return false;
  }

  /**
   * @param {Node} node - Candidate node
   * @param {object} alternative - Compiled alternative
   * @param {MatchScope} scope - Match state
   * @returns {boolean} Whether the node matches the alternative
   */
  matchesAlternative(node, alternative, scope) {
    const { anchor, steps } = alternative;
    if (steps.length > 0) {
      return this.matchesStep(node, alternative, steps.length - 1, scope);
    }
    if (anchor === ROOT) return isRoot(node);
    return this.anchorNodes(anchor, node, scope).has(node);
  }

  /**
   * Match a node against step `index`, then the rest of the path leftwards.
   *
   * @param {Node} node - Candidate node
   * @param {object} alternative - Compiled alternative
   * @param {number} index - Index of the step to test
   * @param {MatchScope} scope - Match state
   * @returns {boolean} Whether the node matches steps 0..index
   */
  matchesStep(node, alternative, index, scope) {
    const step = alternative.steps[index];
    if (!this.testStep(node, step, scope)) return false;

    const parent = parentOf(node);
    if (step.separator === null) return true;

    let accepts;
    if (index > 0) {
      accepts = (candidate) =>
        this.matchesStep(candidate, alternative, index - 1, scope);
    } else if (alternative.anchor === ROOT) {
      accepts = isRoot;
    } else {
      const anchors = this.anchorNodes(alternative.anchor, node, scope);
      accepts = (candidate) => anchors.has(candidate);
    }

    if (step.separator === "/") return parent !== null && accepts(parent);
    for (let ancestor = parent; ancestor; ancestor = parentOf(ancestor)) {
      if (accepts(ancestor)) return true;
    }
    return false;
  }

  /**
   * Test a node against the axis, node test and predicates of one step.
   *
   * @param {Node} node - Candidate node
   * @param {object} step - Compiled step
   * @param {MatchScope} scope - Match state
   * @returns {boolean} Whether the node satisfies the step
   */
  testStep(node, step, scope) {
    const type = node.nodeType;
    if (step.axis === "attribute") {
      if (type !== 2 || isNamespaceDeclaration(node)) return false;
    } else if (type === 2 || type === 9 || type === 11) {
      return false;
    }
    if (
      !this.evaluator.matchNodeTest(
        step.nodeTest,
        node,
        scope.testContext(node),
      )
    ) {
      return false;
    }

    for (let k = 0; k < step.predicates.length; k++) {
      if (!this.testPredicate(node, step, k, scope)) return false;
    }
    return true;
  }

  /**
   * Evaluate predicate `k` of a step for a node.
   *
   * @param {Node} node - Candidate node
   * @param {object} step - Compiled step
   * @param {number} k - Predicate index
   * @param {MatchScope} scope - Match state
   * @returns {boolean} Whether the predicate holds
   */
  testPredicate(node, step, k, scope) {
    const predicate = step.predicates[k];
    let position = 1;
    let size = 1;

    if (predicate.positional) {
      ({ position, size } = this.siblingPosition(node, step, k, scope));
    }

    const value = this.evaluator.evaluate(
      predicate.expr,
      scope.context(node, position, size),
    );
    if (typeof value !== "number") return this.evaluator.toBoolean(value);
    if (!predicate.positional) {
      position = this.siblingPosition(node, step, k, scope).position;
    }
    return value === position;
  }

  /**
   * Position and size of a node among its siblings that pass the step's node
   * test and its predicates before `k`. Cached per parent and predicate.
   *
   * @param {Node} node - Candidate node
   * @param {object} step - Compiled step
   * @param {number} k - Predicate index
   * @param {MatchScope} scope - Match state
   * @returns {{position: number, size: number}} Context position and size
   */
  siblingPosition(node, step, k, scope) {
    const parent = parentOf(node);
    if (!parent) return { position: 1, size: 1 };

    let byPredicate = this.positions.get(parent);
    if (!byPredicate) {
      byPredicate = new Map();
      this.positions.set(parent, byPredicate);
    }

    const predicate = step.predicates[k];
    let entry = byPredicate.get(predicate);
    if (!entry) {
      const nodes = this.candidateSiblings(parent, step, k, scope);
      const index = new Map();
      nodes.forEach((sibling, i) => index.set(sibling, i + 1));
      entry = { index, size: nodes.length };
      byPredicate.set(predicate, entry);
    }

    return { position: entry.index.get(node) ?? 0, size: entry.size };
  }

  /**
   * Siblings selected by a step before predicate `k` is applied.
   *
   * @param {Node} parent - The common parent
   * @param {object} step - Compiled step
   * @param {number} k - Predicate index
   * @param {MatchScope} scope - Match state
   * @returns {Node[]} The candidate siblings in document order
   */
  candidateSiblings(parent, step, k, scope) {
    const all =
      step.axis === "attribute"
        ? Array.from(parent.attributes || [])
        : childAxis(parent);
    let nodes = all.filter(
      (sibling) =>
        (sibling.nodeType === 2) === (step.axis === "attribute") &&
        !(sibling.nodeType === 2 && isNamespaceDeclaration(sibling)) &&
        this.evaluator.matchNodeTest(
          step.nodeTest,
          sibling,
          scope.testContext(sibling),
        ),
    );
    const base = scope.context(parent, 1, 1);
    for (let i = 0; i < k; i++) {
      nodes = this.evaluator.filterByPredicate(nodes, step.predicates[i], base);
    }
    return nodes;
  }

  /**
   * The nodes selected by the `id()`/`key()` anchor of a pattern relative to
   * a node. With literal arguments the set only depends on the node's tree
   * and the prefixes in scope, so it is computed once per root until
   * {@link PatternMatcher#reset}, instead of once per candidate node.
   *
   * @param {object} anchor - Function call AST
   * @param {Node} node - Node providing the document
   * @param {MatchScope} scope - Match state
   * @returns {Set<Node>} The anchor nodes
   */
  anchorNodes(anchor, node, scope) {
    if (!isStaticAnchor(anchor)) {
      return this.evaluateAnchor(anchor, node, scope);
    }

    const root = rootOf(node);
    let byAnchor = this.anchors.get(root);
    if (!byAnchor) {
      byAnchor = new Map();
      this.anchors.set(root, byAnchor);
    }
    let byScope = byAnchor.get(anchor);
    if (!byScope) {
      byScope = new Map();
      byAnchor.set(anchor, byScope);
    }
    let nodes = byScope.get(scope.namespaces);
    if (!nodes) {
      nodes = this.evaluateAnchor(anchor, node, scope);
      byScope.set(scope.namespaces, nodes);
    }
    return nodes;
  }

  /**
   * Evaluate the `id()`/`key()` anchor of a pattern relative to a node.
   *
   * @param {object} anchor - Function call AST
   * @param {Node} node - Node providing the document
   * @param {MatchScope} scope - Match state
   * @returns {Set<Node>} The anchor nodes
   */
  evaluateAnchor(anchor, node, scope) {
    const result = this.evaluator.evaluate(anchor, scope.context(node, 1, 1));
    return new Set(Array.isArray(result) ? result : []);
  }
}
