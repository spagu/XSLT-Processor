/**
 * Data of the references page and the home page's "Used by" band.
 *
 * site/references/references.json is hand-maintained: who uses the library
 * (usedBy, listed only with `approved: true`, i.e. after the project agreed)
 * and the specifications and test suites it is verified against (builtOn).
 * The npm downloads and GitHub stars are fetched at build time, never typed
 * in; the last fetched values are kept in the git-ignored site/data/stats.json,
 * with site/references/stats.json as the committed fallback, so a build offline
 * (SITE_OFFLINE=1) or with the APIs down still shows numbers, with the date
 * they were fetched, and a build never changes a tracked file.
 *
 * @module site/scripts/references
 */

/* global fetch, AbortSignal, URL -- Node.js 18+ globals */

/** npm downloads of the last month (30 days). */
export const NPM_DOWNLOADS_URL =
  "https://api.npmjs.org/downloads/point/last-month/@tradik/xslt-processor";

/** GitHub repository API; stargazers_count is the number of stars. */
export const GITHUB_REPO_URL =
  "https://api.github.com/repos/spagu/XSLT-Processor";

/** How long one API request may take before the cached values are used. */
export const FETCH_TIMEOUT_MS = 5000;

/** Entries of the home page band. */
export const HOME_LIMIT = 6;

/**
 * The usedBy entries that may be published: those with `approved: true`.
 *
 * @param {Array<{name: string, url: string, use: string, approved?: boolean}>} entries
 * @returns {Array<{name: string, url: string, domain: string, use: string}>}
 *   Approved entries with the host name to show as the link text
 */
export function approvedReferences(entries) {
  return entries
    .filter((entry) => entry.approved === true)
    .map(({ name, url, use }) => ({
      name,
      url,
      domain: new URL(url).hostname.replace(/^www\./, ""),
      use,
    }));
}

/**
 * A date as the page writes it, e.g. "3 October 2026".
 *
 * @param {string} isoDate - Date as YYYY-MM-DD
 * @returns {string} Day, month name and year
 */
export function formatDate(isoDate) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * GET a JSON document, failing after `timeoutMs`.
 *
 * @param {typeof fetch} fetchImpl - fetch implementation
 * @param {string} url - Document URL
 * @param {number} timeoutMs - Time limit
 * @returns {Promise<object>} Parsed JSON
 * @throws {Error} On a timeout, a network error or a non-2xx status
 */
async function getJson(fetchImpl, url, timeoutMs) {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": "xslt-processor-site",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Fetch the npm downloads of the last month and the GitHub stars.
 *
 * @param {object} options
 * @param {typeof fetch} [options.fetchImpl=fetch] - fetch implementation
 * @param {number} [options.timeoutMs=FETCH_TIMEOUT_MS] - Limit per request
 * @param {Date} [options.now=new Date()] - Fetch time, for fetchedAt
 * @returns {Promise<{downloads: number, stars: number, fetchedAt: string}>}
 * @throws {Error} When either request fails or returns no number
 */
export async function fetchStats({
  fetchImpl = fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
  now = new Date(),
} = {}) {
  const [npm, repo] = await Promise.all([
    getJson(fetchImpl, NPM_DOWNLOADS_URL, timeoutMs),
    getJson(fetchImpl, GITHUB_REPO_URL, timeoutMs),
  ]);
  const downloads = npm.downloads;
  const stars = repo.stargazers_count;
  if (!Number.isInteger(downloads) || !Number.isInteger(stars)) {
    throw new Error("unexpected API response: no downloads or stars");
  }
  return { downloads, stars, fetchedAt: now.toISOString().slice(0, 10) };
}

/**
 * The numbers to publish: freshly fetched (and saved), or the saved ones
 * when offline or when fetching fails.
 *
 * @param {object} options
 * @param {boolean} options.offline - Skip fetching (SITE_OFFLINE=1)
 * @param {() => object|null} options.readCache - Saved stats, or null
 * @param {(stats: object) => void} options.writeCache - Save fetched stats
 * @param {() => Promise<object>} [options.fetchFresh=fetchStats] - Fetcher
 * @param {(message: string) => void} [options.log=console.warn] - Notices
 * @returns {Promise<{downloads: number, stars: number, fetchedAt: string}|null>}
 *   Stats, or null when nothing was fetched or saved yet
 */
export async function loadStats({
  offline,
  readCache,
  writeCache,
  fetchFresh = fetchStats,
  log = console.warn,
}) {
  if (!offline) {
    try {
      const stats = await fetchFresh();
      writeCache(stats);
      return stats;
    } catch (error) {
      log(
        `Site stats: fetching failed (${error.message}); using saved values.`,
      );
    }
  }
  return readCache();
}

/**
 * The data file the templates read (site/data/references.json).
 *
 * @param {object} options
 * @param {{usedBy: object[], builtOn: object[]}} options.source - Hand-maintained data
 * @param {{downloads: number, stars: number, fetchedAt: string}|null} options.stats
 * @returns {object} usedBy, home (the first HOME_LIMIT), builtOn and stats
 *   with the numbers and date formatted for display
 */
export function referencesData({ source, stats }) {
  const usedBy = approvedReferences(source.usedBy);
  const number = new Intl.NumberFormat("en-GB");
  return {
    usedBy,
    home: usedBy.slice(0, HOME_LIMIT),
    builtOn: source.builtOn,
    stats: stats && {
      downloads: number.format(stats.downloads),
      stars: number.format(stats.stars),
      fetchedAt: stats.fetchedAt,
      asOf: formatDate(stats.fetchedAt),
    },
  };
}
