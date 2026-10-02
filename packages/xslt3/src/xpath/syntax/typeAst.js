/**
 * The XPath 3.1 abstract syntax tree: node tests, item types and sequence
 * types. Same conventions as ast.js (`{ type, ...fields, start, end }`).
 * This module holds type definitions only.
 *
 * @module @tradik/xslt3/xpath/syntax/typeAst
 */

/** @typedef {import("./ast.js").QName} QName */

/**
 * `ItemType occurrence`; `itemType` null means `empty-sequence()`.
 * `occurrence` is "" (exactly one), "?", "*" or "+".
 *
 * @typedef {{type: "SequenceType", itemType: ItemType|null, occurrence: ""|"?"|"*"|"+", start: number, end: number}} SequenceType
 */

/**
 * Any item type. A parenthesized item type `(T)` leaves no node.
 *
 * @typedef {KindTest|AnyItemTest|AtomicType|AnyFunctionTest|TypedFunctionTest|
 *   AnyMapTest|TypedMapTest|AnyArrayTest|TypedArrayTest} ItemType
 */

/** @typedef {NameTest|Wildcard|KindTest} NodeTest Test of an axis step */

/**
 * @typedef {AnyKindTest|DocumentTest|ElementTest|AttributeTest|
 *   SchemaElementTest|SchemaAttributeTest|PITest|CommentTest|TextTest|
 *   NamespaceNodeTest} KindTest
 */

/** @typedef {{type: "NameTest", name: QName, start: number, end: number}} NameTest */

/**
 * Wildcard name test: `*` (all fields null), `prefix:*` (prefix set),
 * `*:local` (local set) or `Q{uri}*` (uri set, possibly "").
 *
 * @typedef {{type: "Wildcard", prefix: string|null, local: string|null, uri: string|null, start: number, end: number}} Wildcard
 */

/** @typedef {{type: "AnyKindTest", start: number, end: number}} AnyKindTest `node()` */
/** @typedef {{type: "DocumentTest", elementTest: ElementTest|SchemaElementTest|null, start: number, end: number}} DocumentTest `document-node(...)` */

/**
 * `element()`, `element(name)`, `element(*, type)`, `element(name, type?)`.
 * `name` null stands for `*` (or no name), `typeName` null for no type;
 * `nillable` is true for the trailing `?`.
 *
 * @typedef {{type: "ElementTest", name: QName|null, typeName: QName|null, nillable: boolean, start: number, end: number}} ElementTest
 */

/** @typedef {{type: "AttributeTest", name: QName|null, typeName: QName|null, start: number, end: number}} AttributeTest `attribute(name-or-*, type)` */
/** @typedef {{type: "SchemaElementTest", name: QName, start: number, end: number}} SchemaElementTest */
/** @typedef {{type: "SchemaAttributeTest", name: QName, start: number, end: number}} SchemaAttributeTest */

/**
 * `processing-instruction(target)`; a string literal target is stored
 * whitespace-normalized; null when there is no target.
 *
 * @typedef {{type: "PITest", target: string|null, start: number, end: number}} PITest
 */

/** @typedef {{type: "CommentTest", start: number, end: number}} CommentTest `comment()` */
/** @typedef {{type: "TextTest", start: number, end: number}} TextTest `text()` */
/** @typedef {{type: "NamespaceNodeTest", start: number, end: number}} NamespaceNodeTest `namespace-node()` */
/** @typedef {{type: "AnyItemTest", start: number, end: number}} AnyItemTest `item()` */
/** @typedef {{type: "AtomicType", name: QName, start: number, end: number}} AtomicType AtomicOrUnionType, e.g. `xs:integer` */
/** @typedef {{type: "AnyFunctionTest", start: number, end: number}} AnyFunctionTest `function(*)` */
/** @typedef {{type: "TypedFunctionTest", paramTypes: SequenceType[], returnType: SequenceType, start: number, end: number}} TypedFunctionTest `function(T1, T2) as R` */
/** @typedef {{type: "AnyMapTest", start: number, end: number}} AnyMapTest `map(*)` */
/** @typedef {{type: "TypedMapTest", keyType: AtomicType, valueType: SequenceType, start: number, end: number}} TypedMapTest `map(K, V)` */
/** @typedef {{type: "AnyArrayTest", start: number, end: number}} AnyArrayTest `array(*)` */
/** @typedef {{type: "TypedArrayTest", memberType: SequenceType, start: number, end: number}} TypedArrayTest `array(T)` */

export {};
