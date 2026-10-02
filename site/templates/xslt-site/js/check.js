/**
 * The online check (/check/): starts loading the analysis bundle at once,
 * so the check works offline after the page has loaded, and starts the page
 * logic (check-app.js).
 *
 * @module check
 */

import { startCheck } from "./check-app.js";

const app = document.getElementById("ck-app");
if (app) startCheck(app, import(app.dataset.checker));
