/**
 * The XPath and XQuery Data Model 3.1 for a basic (non-schema-aware)
 * processor: atomic types and values, casting, comparisons, arithmetic,
 * atomization and effective boolean value.
 *
 * @module @tradik/xslt3/xdm
 */

export { XPathError } from "../errors.js";
export {
  allTypes,
  derivesFrom,
  getType,
  isNumericType,
  namePatterns,
  types,
  XS_NAMESPACE,
} from "./types.js";
export {
  atomic,
  AtomicValue,
  checkFacets,
  isArray,
  isAtomic,
  isFunctionItem,
  isMap,
  isNode,
  ITEM_KIND,
  itemKind,
} from "./atomic.js";
export { Decimal, DIVISION_SCALE } from "./decimal.js";
export { DateTimeValue, MAX_YEAR } from "./datetime.js";
export { DurationValue } from "./duration.js";
export { QNameValue } from "./qname.js";
export { canonicalString, fromLexical } from "./lexical.js";
export { cast, castable } from "./cast.js";
export { compareAtomic, deepEqualAtomic, valueCompare } from "./compare.js";
export { generalCompare, toNumber } from "./generalCompare.js";
export { arithmetic, unaryArithmetic } from "./arithmetic.js";
export {
  atomize,
  effectiveBooleanValue,
  nodeStringValue,
  stringValue,
  typedValue,
} from "./nodes.js";
export { compareCodepoints, normalizeWhitespace } from "./strings.js";
