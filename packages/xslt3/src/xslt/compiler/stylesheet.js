/**
 * The stylesheet compiler: loads the modules, collects the declarations
 * by kind and compiles them in dependency order (namespace aliases,
 * decimal formats and function signatures before any expression; global
 * names before any body), then runs the checks that need everything
 * (called templates, attribute sets).
 *
 * @module @tradik/xslt3/xslt/compiler/stylesheet
 */

import { defaultFunctionLibrary } from "../../xpath/index.js";
import { xsltFunctions } from "../runtime/functions.js";
import { XSL_NS, xsltError } from "../names.js";
import { declareAttributeSet } from "../instructions/attributeSets.js";
import { checkAttributes, checkEmpty } from "./attributes.js";
import { infoOf } from "./elementInfo.js";
import { ExpressionCompiler } from "./expressions.js";
import {
  collectGlobals,
  compileFunction,
  compileGlobals,
  functionSignature,
  winners,
} from "./globals.js";
import { declarationsOf, loadModuleTree } from "./modules.js";
import { collectDecimalFormats } from "./decimalFormats.js";
import {
  checkCharacterMaps,
  collectCharacterMaps,
  collectOutputs,
} from "./outputDecl.js";
import {
  collectAliases,
  compileSpaceRules,
  declareKey,
  declareMode,
} from "./miscDecl.js";
import { CompilerRegistry } from "./registry.js";
import { declareSimplified, declareTemplate } from "./templatesDecl.js";

/** Top-level XSLT declarations. */
const DECLARATIONS = new Set([
  "template",
  "function",
  "variable",
  "param",
  "key",
  "output",
  "decimal-format",
  "namespace-alias",
  "strip-space",
  "preserve-space",
  "character-map",
  "attribute-set",
  "mode",
  "import-schema",
  "global-context-item",
]);

/** Declarations that must be empty. */
const EMPTY_DECLARATIONS = new Set([
  "strip-space",
  "preserve-space",
  "namespace-alias",
  "output",
  "decimal-format",
]);

/** Compiles a stylesheet; it is also the `cx` handed to every compiler. */
export class StylesheetCompiler extends CompilerRegistry {
  /**
   * @param {Element} element
   * @returns {number} the effective version of an element
   */
  versionOf(element) {
    return infoOf(element).version;
  }

  /**
   * @param {Element} element
   * @returns {string|undefined} its base URI
   */
  baseUriOf(element) {
    return infoOf(element).baseUri;
  }

  /**
   * The declarations of a module tree by kind, checked.
   * @param {object} tree - See modules.js
   * @returns {(kind: string) => object[]} the declarations of a kind
   */
  collectDeclarations(tree) {
    const byKind = new Map();
    for (const declaration of declarationsOf(tree)) {
      const { element, simplified } = declaration;
      const kind = simplified ? "simplified" : element.localName;
      if (!simplified && element.namespaceURI !== XSL_NS) {
        if (!element.namespaceURI) {
          throw xsltError("XTSE0130", `${element.nodeName} has no namespace`);
        }
        continue;
      }
      if (!simplified && !DECLARATIONS.has(kind)) {
        if (infoOf(element).version > 3) continue;
        throw xsltError("XTSE0010", `xsl:${kind} is not a declaration`);
      }
      if (!simplified) checkAttributes(element);
      if (EMPTY_DECLARATIONS.has(kind)) checkEmpty(element, this);
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(declaration);
      this.declarationPrecedence.set(element, declaration.precedence);
    }
    if (byKind.has("import-schema")) {
      throw xsltError("XTSE1650", "xsl:import-schema needs schema awareness");
    }
    return (kind) => byKind.get(kind) ?? [];
  }

  /**
   * Compiles the declarations that every expression depends on: function
   * signatures, decimal formats, global variable names.
   * @param {(kind: string) => object[]} all
   * @returns {{signatures: Map, globals: Map}}
   */
  compileContext(all) {
    this.aliases = collectAliases(all("namespace-alias"));
    this.exprs = new ExpressionCompiler({ library: defaultFunctionLibrary });
    const signatures = winners(
      all("function").map((d) => ({
        ...d,
        signature: functionSignature(d, this),
      })),
      (d) => d.signature.key,
      "XTSE0770",
    );
    const definitions = [...signatures.values()].map((d) =>
      this.functionDefinition(d.signature),
    );
    this.exprs = new ExpressionCompiler({
      library: defaultFunctionLibrary.extend(xsltFunctions, definitions),
      decimalFormats: collectDecimalFormats(all("decimal-format"), this),
    });
    const globals = collectGlobals([...all("variable"), ...all("param")], this);
    this.setGlobals([...globals.keys()]);
    return { signatures, globals };
  }

  /**
   * Compiles the stylesheet.
   * @param {Document|Element} source
   * @param {string|undefined} uri
   * @returns {StylesheetCompiler} this, with everything compiled
   */
  compile(source, uri) {
    const tree = loadModuleTree(source, uri, this);
    const all = this.collectDeclarations(tree);
    const { signatures, globals } = this.compileContext(all);
    this.outputs = collectOutputs(all("output"), this);
    this.characterMaps = collectCharacterMaps(all("character-map"), this);
    checkCharacterMaps(this.outputs, this.characterMaps);
    this.spaceRules = compileSpaceRules(
      [...all("strip-space"), ...all("preserve-space")],
      this,
    );
    for (const declaration of all("mode")) declareMode(declaration, this);
    this.globals = compileGlobals(globals, this);
    for (const { element } of all("attribute-set")) {
      declareAttributeSet(element, this);
    }
    for (const declaration of all("key")) declareKey(declaration, this);
    for (const declaration of all("template")) {
      declareTemplate(declaration, this);
    }
    for (const declaration of all("simplified")) {
      declareSimplified(declaration, this);
    }
    for (const { signature } of signatures.values()) {
      Object.assign(
        this.functionBodies.get(signature.key),
        compileFunction(signature, this),
      );
    }
    for (const check of this.deferred) check();
    this.finishModes();
    this.sc = this.exprs.staticContext(tree.root);
    this.defaultModeName = infoOf(tree.root).defaultMode;
    return this;
  }
}
