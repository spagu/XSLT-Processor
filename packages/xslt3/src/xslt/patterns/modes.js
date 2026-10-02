/**
 * Modes and their template rules (XSLT 3.0 sections 6.4 to 6.6): rules
 * ranked by import precedence, priority and declaration order, indexed by
 * the node kind and name their patterns can match, so finding the rule
 * for a node tests only the candidates for that node.
 *
 * @module @tradik/xslt3/xslt/patterns/modes
 */

import { xsltError } from "../names.js";

/**
 * A template rule: one alternative of the pattern of a template.
 * @typedef {object} Rule
 * @property {object} template - The compiled template
 * @property {import("./compile.js").PatternAlternative} alternative
 * @property {number} priority
 * @property {number} precedence - Import precedence
 * @property {number} position - Declaration order
 * @property {number} [rank] - Position in the ranking (0 is best)
 */

/**
 * The index keys of an item: specific (by name) and by kind.
 * @param {*} item
 * @returns {string[]}
 */
function itemKeys(item) {
  switch (item?.nodeType) {
    case 1:
      return [`e{${item.namespaceURI ?? ""}}${item.localName}`, "k1"];
    case 2:
      return [`a{${item.namespaceURI ?? ""}}${item.localName}`, "k2"];
    case 3:
    case 4:
      return ["k3"];
    case 11:
      return ["k9"];
    case undefined:
      return [];
    default:
      return [`k${item.nodeType}`];
  }
}

/** A mode: its rules and how unmatched items are processed. */
export class Mode {
  /** @param {string} name - Clark name, "#default" for the unnamed mode */
  constructor(name) {
    this.name = name;
    /** @type {Rule[]} */
    this.rules = [];
    this.onNoMatch = "text-only-copy";
    this.onMultipleMatch = "use-last";
    this.index = null;
  }

  /** @param {Rule} rule */
  add(rule) {
    this.rules.push(rule);
    this.index = null;
  }

  /** Ranks the rules and builds the index. */
  build() {
    this.rules.sort(
      (a, b) =>
        b.precedence - a.precedence ||
        b.priority - a.priority ||
        b.position - a.position,
    );
    const index = new Map([["*", []]]);
    this.rules.forEach((rule, rank) => {
      rule.rank = rank;
      const key = rule.alternative.key;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(rule);
    });
    this.index = index;
  }

  /**
   * The candidate rules of an item, best first.
   * @param {*} item
   * @returns {Rule[]}
   */
  candidates(item) {
    if (!this.index) {
      this.build();
      this.memo = new Map();
    }
    const keys = itemKeys(item);
    const memoKey = keys[0] ?? "";
    let result = this.memo.get(memoKey);
    if (!result) {
      const lists = [this.index.get("*")];
      for (const key of keys) {
        const list = this.index.get(key);
        if (list) lists.push(list);
      }
      result = lists.flat().sort((a, b) => a.rank - b.rank);
      this.memo.set(memoKey, result);
    }
    return result;
  }

  /**
   * Finds the best matching rule.
   * @param {*} item
   * @param {object} xc - Context whose item is `item`
   * @param {(rule: Rule) => boolean} [accept] - Restricts the rules
   *   (xsl:apply-imports, xsl:next-match)
   * @returns {Rule|null}
   */
  find(item, xc, accept) {
    const candidates = this.candidates(item);
    for (let i = 0; i < candidates.length; i++) {
      const rule = candidates[i];
      if (accept && !accept(rule)) continue;
      if (!rule.alternative.matches(item, xc)) continue;
      if (this.onMultipleMatch === "fail") {
        this.checkAmbiguity(candidates, i, item, xc, accept);
      }
      return rule;
    }
    return null;
  }

  /**
   * Raises XTDE0540 when another rule of the same rank matches.
   * @param {Rule[]} candidates
   * @param {number} i - Index of the chosen rule
   * @param {*} item
   * @param {object} xc
   * @param {Function} [accept]
   */
  checkAmbiguity(candidates, i, item, xc, accept) {
    const chosen = candidates[i];
    for (let j = i + 1; j < candidates.length; j++) {
      const other = candidates[j];
      if (
        other.precedence !== chosen.precedence ||
        other.priority !== chosen.priority
      ) {
        break;
      }
      if (other.template === chosen.template) continue;
      if ((!accept || accept(other)) && other.alternative.matches(item, xc)) {
        throw xsltError("XTDE0540", "Several template rules match the item");
      }
    }
  }
}
