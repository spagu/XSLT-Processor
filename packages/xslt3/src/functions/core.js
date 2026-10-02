/**
 * The core functions of F&O 3.1 that depend on the evaluator: booleans,
 * focus, string, data and number conversion, count, empty and exists.
 * `coreFunctions` gathers these and the other modules of this package
 * that depend on the evaluator or on the hooks of the dynamic context
 * (nodes, higher-order functions, maps and arrays, JSON, resources,
 * random numbers, IDs, collections).
 *
 * @module @tradik/xslt3/functions/core
 */

import { toNumber } from "../xdm/generalCompare.js";
import { atomize, effectiveBooleanValue, stringValue } from "../xdm/nodes.js";
import {
  booleanItem,
  doubleItem,
  integerItem,
  stringItem,
} from "../xpath/eval/atomics.js";
import { arrayFunctions } from "./arrays.js";
import { contextFunctions } from "./context.js";
import { higherOrderFunctions } from "./higherOrder.js";
import { coreStringFunctions, libraryFunctions } from "./library.js";
import { mapFunctions } from "./maps.js";
import { nodeFunctions } from "./nodes.js";
import { focusItem } from "./focus.js";
import { diagnosticFunctions } from "./diagnostics.js";
import { collectionFunctions } from "./collections.js";
import { idFunctions } from "./ids.js";
import { jsonFunctions } from "./json/index.js";
import { parseXmlFunctions } from "./parseXml.js";
import { randomFunctions } from "./random.js";
import { unparsedTextFunctions } from "./unparsedText.js";
import { xqueryModuleFunctions } from "./xqueryModule.js";

/**
 * fn:string of an optional item.
 * @param {Array} arg
 * @returns {Array} an xs:string
 */
const stringOf = (arg) => [stringItem(arg.length ? stringValue(arg[0]) : "")];

/**
 * fn:number of an optional atomic value.
 * @param {Array} arg
 * @returns {Array} an xs:double
 */
const numberOf = (arg) => [arg.length ? toNumber(arg[0]) : doubleItem(NaN)];

/** Core function definitions. */
export const coreBasics = [
  {
    local: "true",
    params: [],
    returns: "xs:boolean",
    impl: () => [booleanItem(true)],
  },
  {
    local: "false",
    params: [],
    returns: "xs:boolean",
    impl: () => [booleanItem(false)],
  },
  {
    local: "not",
    params: ["item()*"],
    returns: "xs:boolean",
    impl: ([arg]) => [booleanItem(!effectiveBooleanValue(arg))],
  },
  {
    local: "boolean",
    params: ["item()*"],
    returns: "xs:boolean",
    impl: ([arg]) => [booleanItem(effectiveBooleanValue(arg))],
  },
  {
    local: "position",
    params: [],
    returns: "xs:integer",
    focus: true,
    impl: (_, context) => (focusItem(context), [integerItem(context.position)]),
  },
  {
    local: "last",
    params: [],
    returns: "xs:integer",
    focus: true,
    impl: (_, context) => (focusItem(context), [integerItem(context.size)]),
  },
  {
    local: "string",
    params: [],
    returns: "xs:string",
    focus: true,
    impl: (_, context) => stringOf([focusItem(context)]),
  },
  {
    local: "string",
    params: ["item()?"],
    returns: "xs:string",
    impl: ([arg]) => stringOf(arg),
  },
  {
    local: "data",
    params: [],
    returns: "xs:anyAtomicType*",
    focus: true,
    impl: (_, context) => atomize([focusItem(context)]),
  },
  {
    local: "data",
    params: ["item()*"],
    returns: "xs:anyAtomicType*",
    impl: ([arg]) => atomize(arg),
  },
  {
    local: "number",
    params: [],
    returns: "xs:double",
    focus: true,
    impl: (_, context) => numberOf(atomize([focusItem(context)])),
  },
  {
    local: "number",
    params: ["xs:anyAtomicType?"],
    returns: "xs:double",
    impl: ([arg]) => numberOf(arg),
  },
  {
    local: "count",
    params: ["item()*"],
    returns: "xs:integer",
    impl: ([arg]) => [integerItem(arg.length)],
  },
  {
    local: "empty",
    params: ["item()*"],
    returns: "xs:boolean",
    impl: ([arg]) => [booleanItem(arg.length === 0)],
  },
  {
    local: "exists",
    params: ["item()*"],
    returns: "xs:boolean",
    impl: ([arg]) => [booleanItem(arg.length > 0)],
  },
];

/** All the function definitions of this package's built-in modules. */
export const coreFunctions = [
  ...libraryFunctions,
  ...coreStringFunctions,
  ...coreBasics,
  ...diagnosticFunctions,
  ...contextFunctions,
  ...nodeFunctions,
  ...higherOrderFunctions,
  ...mapFunctions,
  ...arrayFunctions,
  ...jsonFunctions,
  ...unparsedTextFunctions,
  ...xqueryModuleFunctions,
  ...parseXmlFunctions,
  ...randomFunctions,
  ...idFunctions,
  ...collectionFunctions,
];
