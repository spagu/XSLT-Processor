/**
 * The XPath 3.1 abstract syntax tree: expression nodes. Node tests and
 * sequence types are described in typeAst.js.
 *
 * Every node is a plain object `{ type, ...fields, start, end }`, where
 * `start` and `end` are offsets (UTF-16 code units) into the expression.
 * Parentheses leave no node: `(E)` is the node of E, `()` an EmptySequence.
 * Names stay as written ({@link QName}); the evaluator resolves prefixes and
 * default namespaces. Numeric literals keep their lexical form, so decimals
 * lose no precision before the data model sees them.
 *
 * @module @tradik/xslt3/xpath/syntax/ast
 */

/**
 * A name as written: `local`, `prefix:local` or `Q{uri}local`.
 *
 * @typedef {object} QName
 * @property {string|null} prefix - Prefix, null when absent
 * @property {string} local - Local part
 * @property {string|null} uri - Namespace of an EQName `Q{uri}local`, else null
 */

/**
 * Any expression node.
 *
 * @typedef {SequenceExpr|EmptySequence|ForExpr|LetExpr|QuantifiedExpr|IfExpr|
 *   LogicalExpr|ComparisonExpr|StringConcatExpr|RangeExpr|ArithmeticExpr|
 *   SetExpr|InstanceOfExpr|TreatExpr|CastableExpr|CastExpr|ArrowExpr|
 *   UnaryExpr|SimpleMapExpr|PathExpr|AxisStep|FilterExpr|DynamicFunctionCall|
 *   Lookup|UnaryLookup|NumericLiteral|StringLiteral|VarRef|ContextItemExpr|
 *   FunctionCall|NamedFunctionRef|InlineFunctionExpr|MapConstructor|
 *   SquareArrayConstructor|CurlyArrayConstructor} Expr
 */

/** @typedef {{type: "SequenceExpr", items: Expr[], start: number, end: number}} SequenceExpr `E1, E2, ...` (two or more items) */
/** @typedef {{type: "EmptySequence", start: number, end: number}} EmptySequence `()` */
/** @typedef {{type: "Binding", name: QName, expr: Expr, start: number, end: number}} Binding `$name in E` or `$name := E` */
/** @typedef {{type: "ForExpr", bindings: Binding[], returnExpr: Expr, start: number, end: number}} ForExpr `for $a in A, $b in B return R` */
/** @typedef {{type: "LetExpr", bindings: Binding[], returnExpr: Expr, start: number, end: number}} LetExpr `let $a := A, $b := B return R` */
/** @typedef {{type: "QuantifiedExpr", quantifier: "some"|"every", bindings: Binding[], satisfies: Expr, start: number, end: number}} QuantifiedExpr */
/** @typedef {{type: "IfExpr", condition: Expr, thenExpr: Expr, elseExpr: Expr, start: number, end: number}} IfExpr */
/** @typedef {{type: "LogicalExpr", operator: "or"|"and", left: Expr, right: Expr, start: number, end: number}} LogicalExpr */

/**
 * Comparison; `kind` is "general" (= != < <= > >=), "value" (eq ne lt le gt
 * ge) or "node" (is << >>). Comparisons do not chain.
 *
 * @typedef {{type: "ComparisonExpr", kind: "general"|"value"|"node", operator: string, left: Expr, right: Expr, start: number, end: number}} ComparisonExpr
 */

/** @typedef {{type: "StringConcatExpr", left: Expr, right: Expr, start: number, end: number}} StringConcatExpr `A || B` */
/** @typedef {{type: "RangeExpr", left: Expr, right: Expr, start: number, end: number}} RangeExpr `A to B` */
/** @typedef {{type: "ArithmeticExpr", operator: "+"|"-"|"*"|"div"|"idiv"|"mod", left: Expr, right: Expr, start: number, end: number}} ArithmeticExpr */
/** @typedef {{type: "SetExpr", operator: "union"|"intersect"|"except", left: Expr, right: Expr, start: number, end: number}} SetExpr `|` is stored as "union" */
/** @typedef {{type: "InstanceOfExpr", expr: Expr, sequenceType: import("./typeAst.js").SequenceType, start: number, end: number}} InstanceOfExpr */
/** @typedef {{type: "TreatExpr", expr: Expr, sequenceType: import("./typeAst.js").SequenceType, start: number, end: number}} TreatExpr */
/** @typedef {{type: "CastableExpr", expr: Expr, targetType: QName, emptyAllowed: boolean, start: number, end: number}} CastableExpr `E castable as T?` */
/** @typedef {{type: "CastExpr", expr: Expr, targetType: QName, emptyAllowed: boolean, start: number, end: number}} CastExpr `E cast as T?` */

/**
 * `E => f(args)`, `E => $f(args)` or `E => (expr)(args)`: exactly one of
 * `functionName` and `functionExpr` is set. Arguments do not include E.
 *
 * @typedef {{type: "ArrowExpr", expr: Expr, functionName: QName|null, functionExpr: Expr|null, arguments: Array<Expr|ArgumentPlaceholder>, start: number, end: number}} ArrowExpr
 */

/** @typedef {{type: "UnaryExpr", operator: "+"|"-", operand: Expr, start: number, end: number}} UnaryExpr `--E` nests two nodes */
/** @typedef {{type: "SimpleMapExpr", left: Expr, right: Expr, start: number, end: number}} SimpleMapExpr `A ! B` */

/**
 * A path with at least one `/` or `//`. `absolute` is true for a leading
 * slash; a lone `/` has no steps. `//` is expanded to
 * `/descendant-or-self::node()/`, so `//a` has two steps.
 *
 * @typedef {{type: "PathExpr", absolute: boolean, steps: Expr[], start: number, end: number}} PathExpr
 */

/**
 * An axis step, abbreviated or not: `@a` has axis "attribute", `..` is
 * `parent::node()`, and a step without axis takes "child", or "attribute"
 * for an attribute()/schema-attribute() test, or "namespace" for
 * namespace-node() (XPath 3.1 section 3.3.5).
 *
 * @typedef {{type: "AxisStep", axis: string, nodeTest: import("./typeAst.js").NodeTest, predicates: Expr[], start: number, end: number}} AxisStep
 */

/** @typedef {{type: "FilterExpr", base: Expr, predicate: Expr, start: number, end: number}} FilterExpr `E[P]` on a primary expression */
/** @typedef {{type: "DynamicFunctionCall", functionExpr: Expr, arguments: Array<Expr|ArgumentPlaceholder>, start: number, end: number}} DynamicFunctionCall `$f(1, ?)` */

/**
 * Lookup `E?key`. `keyKind` "name" (`key` is the NCName), "integer" (`key`
 * is the lexical integer), "expr" (`key` is the parenthesized Expr) or
 * "wildcard" (`?*`, `key` null).
 *
 * @typedef {{type: "Lookup", base: Expr, keyKind: "name"|"integer"|"expr"|"wildcard", key: string|Expr|null, start: number, end: number}} Lookup
 */

/** @typedef {{type: "UnaryLookup", keyKind: "name"|"integer"|"expr"|"wildcard", key: string|Expr|null, start: number, end: number}} UnaryLookup `?key` on the context item */
/** @typedef {{type: "NumericLiteral", kind: "integer"|"decimal"|"double", value: string, start: number, end: number}} NumericLiteral `value` is the lexical form */
/** @typedef {{type: "StringLiteral", value: string, start: number, end: number}} StringLiteral Doubled quotes already unescaped */
/** @typedef {{type: "VarRef", name: QName, start: number, end: number}} VarRef */
/** @typedef {{type: "ContextItemExpr", start: number, end: number}} ContextItemExpr `.` */
/** @typedef {{type: "FunctionCall", name: QName, arguments: Array<Expr|ArgumentPlaceholder>, start: number, end: number}} FunctionCall With a placeholder it is a partial application */
/** @typedef {{type: "ArgumentPlaceholder", start: number, end: number}} ArgumentPlaceholder `?` as an argument */
/** @typedef {{type: "NamedFunctionRef", name: QName, arity: number, start: number, end: number}} NamedFunctionRef `name#arity` */
/** @typedef {{type: "Param", name: QName, sequenceType: import("./typeAst.js").SequenceType|null, start: number, end: number}} Param */
/** @typedef {{type: "InlineFunctionExpr", params: Param[], returnType: import("./typeAst.js").SequenceType|null, body: Expr, start: number, end: number}} InlineFunctionExpr An empty body `{}` is an EmptySequence */
/** @typedef {{type: "MapEntry", key: Expr, value: Expr, start: number, end: number}} MapEntry */
/** @typedef {{type: "MapConstructor", entries: MapEntry[], start: number, end: number}} MapConstructor `map { k : v, ... }` */
/** @typedef {{type: "SquareArrayConstructor", members: Expr[], start: number, end: number}} SquareArrayConstructor `[a, b]`: one member per expression */
/** @typedef {{type: "CurlyArrayConstructor", expr: Expr, start: number, end: number}} CurlyArrayConstructor `array { E }`: one member per item of E */

/**
 * Creates a node with the fields in a stable order: type, fields, offsets.
 *
 * @template {object} F
 * @param {string} type - Node type
 * @param {F} fields - Node-specific fields
 * @param {number} start - Offset of the first character
 * @param {number} end - Offset after the last character
 * @returns {{type: string, start: number, end: number} & F} The node
 */
export function makeNode(type, fields, start, end) {
  // Object.assign: several times faster than a spread in a literal here
  const node = Object.assign({ type }, fields);
  node.start = start;
  node.end = end;
  return node;
}
