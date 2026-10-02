/**
 * The migration wizard remembers the answers in this browser (localStorage).
 * The page works without it: CSS shows the steps for the checked answers.
 */
const KEY = "migrate-wizard";
const form = document.querySelector(".mg-questions");

/**
 * Read the stored answers; storage can be unavailable or hold anything.
 *
 * @returns {Record<string, string>} Input name to value
 */
function load() {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

if (form) {
  for (const [name, value] of Object.entries(load())) {
    const input = form.querySelector(
      `input[name="${window.CSS.escape(name)}"][value="${window.CSS.escape(String(value))}"]`,
    );
    if (input) input.checked = true;
  }
  form.addEventListener("change", () => {
    const answers = Object.fromEntries(new window.FormData(form));
    try {
      window.localStorage.setItem(KEY, JSON.stringify(answers));
    } catch {
      // Private mode or blocked storage: the answers just are not remembered
    }
  });
}
