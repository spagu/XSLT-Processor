/**
 * `import "@tradik/xslt-processor/polyfill";`: one line that keeps
 * native-XSLT code working where the browser has none. It installs this
 * XSLTProcessor as `globalThis.XSLTProcessor` when the browser's own is
 * missing or broken (installGlobal), and applies an `<?xml-stylesheet?>`
 * the browser left unapplied (autoApplyXmlStylesheet). In a browser that
 * still has XSLT it changes nothing. It exports nothing; import it for its
 * effect, before the code that uses XSLTProcessor.
 *
 * The published entry (dist/polyfill.js, .cjs) is the same two calls on the
 * package's bundle, so the library is loaded once.
 *
 * @module polyfill
 */

import { autoApplyXmlStylesheet, installGlobal } from "./index.js";

installGlobal();
autoApplyXmlStylesheet();
