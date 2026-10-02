/**
 * xsl:merge at run time (XSLT 3.0 sections 15.3 to 15.6): the merge
 * input sequences with their merge key values, checked to be sorted (or
 * sorted first), merged in a stable order, and partitioned into groups
 * of equal composite keys; and the functions current-merge-group() and
 * current-merge-key().
 *
 * @module @tradik/xslt3/xslt/runtime/merging
 */

import { xsltError } from "../names.js";
import { withFocus } from "./context.js";
import { compareValues, keyValue, settingsOf } from "./sortKeys.js";

/**
 * Compares two composite merge keys.
 * @param {Array} a
 * @param {Array} b
 * @param {object[]} settings - Settings of each key component
 * @param {object} xc
 * @returns {number}
 * @throws {import("../../errors.js").XPathError} XTTE2230 for values that
 *   cannot be compared
 */
export function compareKeys(a, b, settings, xc) {
  for (let k = 0; k < settings.length; k++) {
    let result;
    try {
      result = compareValues(a[k], b[k], settings[k], xc);
    } catch (error) {
      if (error.code !== "XTDE1030") throw error;
      throw xsltError("XTTE2230", "Merge key values are not comparable");
    }
    if (result !== 0) return settings[k].descending ? -result : result;
  }
  return 0;
}

/**
 * The effective values of the attributes of the merge keys of a source,
 * which must be the same for every source (XTDE2210).
 * @param {object[]} keys - Compiled xsl:merge-key elements
 * @param {object} xc
 * @returns {string[]}
 */
function effectiveAttributes(keys, xc) {
  const names = ["order", "lang", "collation", "caseOrder", "dataType"];
  return keys.map((key) =>
    names
      .map((name) => (key[name] ? `=${key[name](xc).trim()}` : ""))
      .join("|"),
  );
}

/**
 * The entries of one merge input sequence: items with their keys, sorted
 * or checked.
 * @param {Array} items
 * @param {object} source - Compiled xsl:merge-source
 * @param {object[]} settings
 * @param {object} xc
 * @param {object} machine
 * @returns {Array<{item: *, keys: Array}>}
 */
function inputEntries(items, source, settings, xc, machine) {
  const entries = items.map((item) => ({
    item,
    keys: source.keys.map((key, k) =>
      keyValue(key, settings[k], withFocus(xc, item, 1, 1), machine),
    ),
  }));
  if (source.sortBeforeMerge) {
    return entries.sort((a, b) => compareKeys(a.keys, b.keys, settings, xc));
  }
  for (let i = 1; i < entries.length; i++) {
    if (compareKeys(entries[i - 1].keys, entries[i].keys, settings, xc) > 0) {
      throw xsltError("XTDE2220", "A merge input sequence is not sorted");
    }
  }
  return entries;
}

/**
 * Computes the groups of an xsl:merge.
 * @param {object[]} sources - Compiled xsl:merge-source elements
 * @param {object} xc - Context of the instruction
 * @param {object} machine
 * @returns {Array<{entries: object[], keys: Array}>} groups in order
 */
export function mergeGroups(sources, xc, machine) {
  const attributes = sources.map((s) => effectiveAttributes(s.keys, xc).join());
  if (attributes.some((text) => text !== attributes[0])) {
    throw xsltError("XTDE2210", "The merge keys of the sources differ");
  }
  const all = [];
  let settings = null;
  for (const source of sources) {
    const sourceSettings = source.keys.map((key) => settingsOf(key, xc));
    settings ??= sourceSettings;
    for (const items of source.inputs(xc, machine)) {
      for (const entry of inputEntries(
        items,
        source,
        sourceSettings,
        xc,
        machine,
      )) {
        all.push({ ...entry, source: source.name });
      }
    }
  }
  if (all.length === 0) return [];
  all.sort((a, b) => compareKeys(a.keys, b.keys, settings, xc));
  const groups = [];
  for (const entry of all) {
    const last = groups.at(-1);
    if (last && compareKeys(last.keys, entry.keys, settings, xc) === 0) {
      last.entries.push(entry);
    } else groups.push({ entries: [entry], keys: entry.keys });
  }
  return groups;
}

/**
 * The current merge group, items of all sources or of one.
 * @param {Array} args
 * @param {object} context
 * @returns {Array}
 */
function currentMergeGroup(args, context) {
  const merge = context.xc.merge;
  if (!merge) throw xsltError("XTDE3480", "There is no current merge group");
  if (args.length === 0) return merge.group.entries.map((e) => e.item);
  const name = args[0][0].value;
  if (!merge.names.includes(name)) {
    throw xsltError("XTDE3490", `No merge source is named ${name}`);
  }
  return merge.group.entries
    .filter((entry) => entry.source === name)
    .map((entry) => entry.item);
}

/** Function definitions. */
export const mergeFunctions = [
  {
    local: "current-merge-group",
    params: [],
    returns: "item()*",
    impl: currentMergeGroup,
  },
  {
    local: "current-merge-group",
    params: ["xs:string"],
    returns: "item()*",
    impl: currentMergeGroup,
  },
  {
    local: "current-merge-key",
    params: [],
    returns: "xs:anyAtomicType*",
    impl: (_, context) => {
      const merge = context.xc.merge;
      if (!merge) throw xsltError("XTDE3510", "There is no current merge key");
      return merge.group.keys.filter((key) => key !== null);
    },
  },
];
