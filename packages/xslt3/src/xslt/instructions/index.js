/**
 * The compilers of the XSLT instructions, by local name. Each takes the
 * instruction element, the stylesheet compiler and the scope, and returns
 * a step of the sequence constructor (see runtime/machine.js) or null.
 *
 * @module @tradik/xslt3/xslt/instructions
 */

import { compileAnalyzeString } from "./analyzeString.js";
import { compileAssert } from "./assert.js";
import { compileChoose, compileForEach, compileIf } from "./control.js";
import {
  compileCopy,
  compileCopyOf,
  compileDocument,
  compilePerformSort,
} from "./copy.js";
import { compileAttribute, compileElement } from "./elements.js";
import {
  compileOnEmpty,
  compileOnNonEmpty,
  compileWherePopulated,
} from "./conditional.js";
import { compileEvaluate } from "./evaluate.js";
import { compileFork } from "./fork.js";
import { compileForEachGroup } from "./grouping.js";
import {
  compileBreak,
  compileIterate,
  compileNextIteration,
} from "./iterate.js";
import { compileMerge } from "./merge.js";
import { compileNumber } from "./number.js";
import { compileMap, compileMapEntry } from "./maps.js";
import { compileMessage } from "./output.js";
import { compileResultDocument } from "./resultDocument.js";
import { compileSourceDocument } from "./sourceDocument.js";
import {
  compileApplyImports,
  compileApplyTemplates,
  compileCallTemplate,
} from "./templates.js";
import { compileTry } from "./try.js";
import {
  compileComment,
  compileNamespace,
  compileProcessingInstruction,
  compileSequence,
  compileText,
  compileValueOf,
} from "./text.js";

/** @type {Record<string, Function>} */
export const instructionCompilers = {
  "analyze-string": compileAnalyzeString,
  "apply-imports": compileApplyImports,
  "apply-templates": compileApplyTemplates,
  attribute: compileAttribute,
  "call-template": compileCallTemplate,
  choose: compileChoose,
  comment: compileComment,
  copy: compileCopy,
  "copy-of": compileCopyOf,
  document: compileDocument,
  element: compileElement,
  "for-each": compileForEach,
  "for-each-group": compileForEachGroup,
  if: compileIf,
  message: compileMessage,
  namespace: compileNamespace,
  "next-match": compileApplyImports,
  number: compileNumber,
  "perform-sort": compilePerformSort,
  "processing-instruction": compileProcessingInstruction,
  "result-document": compileResultDocument,
  map: compileMap,
  "map-entry": compileMapEntry,
  try: compileTry,
  sequence: compileSequence,
  text: compileText,
  "value-of": compileValueOf,
  // XSLT 3.0 instructions of task 0031
  break: compileBreak,
  iterate: compileIterate,
  "next-iteration": compileNextIteration,
  "on-empty": compileOnEmpty,
  "on-non-empty": compileOnNonEmpty,
  "where-populated": compileWherePopulated,
  fork: compileFork,
  "source-document": compileSourceDocument,
  merge: compileMerge,
  evaluate: compileEvaluate,
  assert: compileAssert,
};
