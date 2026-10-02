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
import { declareAttributeSet } from "../instructions/attributeSets.js";
import { declareAccumulators } from "./accumulatorDecl.js";
import { declareGlobalContextItem } from "./globalContextItem.js";
import { infoOf } from "./elementInfo.js";
import { ExpressionCompiler } from "./expressions.js";
import {
  collectGlobals,
  compileFunction,
  functionSignature,
  winners,
} from "./globals.js";
import { collectDeclarations } from "./declarationKinds.js";
import { loadModuleTree } from "./modules.js";
import { collectDecimalFormats } from "./decimalFormats.js";
import {
  checkCharacterMaps,
  collectCharacterMaps,
  collectOutputs,
} from "./outputDecl.js";
import { collectAliases, compileSpaceRules, declareKey } from "./miscDecl.js";
import { checkModeDeclarations, declareMode } from "./modeDecl.js";
import {
  compileSlots,
  importAccepted,
  layoutGlobals,
  markAbstract,
} from "./linker.js";
import { linkOverrides } from "./overrideLinks.js";
import { buildTable, packageHeader } from "./packageTable.js";
import { usePackage } from "./packages.js";
import { checkDeclaredModes, checkExecutable } from "./packageChecks.js";
import { PackageRegistry } from "./packageRegistry.js";
import { declareSimplified, declareTemplate } from "./templatesDecl.js";

/** Compiles a stylesheet; it is also the `cx` handed to every compiler. */
export class StylesheetCompiler extends PackageRegistry {
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
    return collectDeclarations(tree, this);
  }

  /**
   * Compiles the declarations that every expression depends on: function
   * signatures, decimal formats, global variable names.
   * @param {(kind: string) => object[]} all
   * @returns {{signatures: Map, globals: Map, definitions: Map}}
   */
  compileContext(all) {
    this.aliases = collectAliases(all("namespace-alias"));
    const signatures = winners(
      all("function").map((d) => ({
        ...d,
        signature: functionSignature(d, this),
      })),
      (d) => d.signature.key,
      "XTSE0770",
    );
    const definitions = new Map(
      [...signatures.values()].map((d) => [
        d.signature.key,
        this.functionDefinition(d.signature),
      ]),
    );
    const accepted = this.uses.flatMap((use) =>
      use.accepted
        .filter(({ component }) => component.kind === "function")
        .map(({ component }) => component.definition),
    );
    this.exprs = new ExpressionCompiler({
      library: defaultFunctionLibrary.extend(xsltFunctions, accepted, [
        ...definitions.values(),
      ]),
      decimalFormats: collectDecimalFormats(all("decimal-format"), this),
      owner: this,
    });
    const globals = collectGlobals([...all("variable"), ...all("param")], this);
    return { signatures, globals, definitions };
  }

  /**
   * A compiler for a package used by this one.
   * @param {string[]} chain - Names of the packages being compiled
   * @returns {StylesheetCompiler}
   */
  usedPackage(chain) {
    return new StylesheetCompiler({
      ...this.options,
      staticParams: new Map(),
      packageChain: chain,
    });
  }

  /**
   * The first stage: modules loaded, used packages prepared, names and
   * visibilities of the components known.
   * @param {Document|Element} source
   * @param {string|undefined} uri
   */
  prepare(source, uri) {
    const tree = loadModuleTree(source, uri, this);
    this.tree = tree;
    this.header = packageHeader(tree.root);
    this.packageName = this.header.name;
    this.packageVersion = this.header.version;
    const all = this.collectDeclarations(tree);
    this.all = all;
    this.exprs = new ExpressionCompiler({ library: defaultFunctionLibrary });
    this.uses = all("use-package").map((d) =>
      usePackage({ ...d, imported: d.precedence !== tree.precedence }, this),
    );
    this.level = Math.max(-1, ...this.uses.map((use) => use.child.level)) + 1;
    this.context = this.compileContext(all);
    buildTable(this, all, this.context);
  }

  /** The second stage: every declaration compiled and linked. */
  finish() {
    for (const use of this.uses) use.child.finish();
    const { all, tree } = this;
    const { signatures } = this.context;
    importAccepted(this);
    this.outputs = collectOutputs(all("output"), this);
    this.characterMaps = collectCharacterMaps(all("character-map"), this);
    checkCharacterMaps(this.outputs, this.characterMaps);
    this.spaceRules = compileSpaceRules(
      [...all("strip-space"), ...all("preserve-space")],
      this,
    );
    for (const declaration of all("mode")) declareMode(declaration, this);
    checkModeDeclarations(this.modes.values());
    this.globals = compileSlots(this);
    declareAccumulators(all, this);
    declareGlobalContextItem(all("global-context-item"), this);
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
    markAbstract(this);
    linkOverrides(this, this.level);
    for (const check of this.deferred) check();
    checkDeclaredModes(this);
    this.finishModes();
    this.sc = this.exprs.staticContext(tree.root);
    this.defaultModeName = infoOf(tree.root).defaultMode;
  }

  /**
   * Compiles the stylesheet (the top-level package and the packages it
   * uses).
   * @param {Document|Element} source
   * @param {string|undefined} uri
   * @returns {StylesheetCompiler} this, with everything compiled
   */
  compile(source, uri) {
    this.prepare(source, uri);
    checkExecutable(this);
    layoutGlobals(this);
    this.finish();
    return this;
  }
}
