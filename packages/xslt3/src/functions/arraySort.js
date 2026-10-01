/**
 * array:sort (F&O 3.1 section 17.3.19): the members of an array sorted
 * like fn:sort sorts items.
 *
 * @module @tradik/xslt3/functions/arraySort
 */

import { XdmArray } from "../items/array.js";
import { NS } from "./signatures.js";
import { sortByKeys } from "./sort.js";

/**
 * array:sort.
 * @returns {Array}
 */
const sort = ([[array], collation, key], context) => [
  new XdmArray(
    sortByKeys(array.members, collation, key?.[0], context, (member) => member),
  ),
];

/** Function definitions. */
export const arraySortFunctions = [
  ["array(*)"],
  ["array(*)", "xs:string?"],
  ["array(*)", "xs:string?", "function(item()*) as xs:anyAtomicType*"],
].map((params) => ({
  namespace: NS.array,
  local: "sort",
  params,
  returns: "array(*)",
  impl: sort,
}));
