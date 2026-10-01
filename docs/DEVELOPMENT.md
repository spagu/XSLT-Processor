# Development

How to set up a working copy of `@tradik/xslt-processor`, run the tests, lint
and build the bundles (locally, with the `Makefile` or in Docker) and publish a
release to npm. Contribution guidelines are in
[CONTRIBUTORS.md](../CONTRIBUTORS.md).

## Prerequisites

- Node.js 22.8+ (native test runner with coverage thresholds; CI runs 22, 24 and 26). `npm test` fails below 100% line and function coverage or 96% branch coverage.
- Docker (optional, for containerized testing)

## Setup

```bash
git clone https://github.com/spagu/XSLT-Processor.git
cd XSLT-Processor
npm install
```

## Commands

```bash
# Run tests
npm test

# Run tests with watch mode
npm run test:watch

# Build bundles
npm run build

# Lint code
npm run lint

# Format code / check formatting
npm run format
npm run format:check
```

The `Makefile` wraps the same commands (`make test`, `make build`, `make lint`,
`make docker-test`, ...; `make help` lists them).

## Repository layout

The repository is an npm workspace. The root is the published
`@tradik/xslt-processor` (XSLT 1.0; `src/`, `bin/`), and `packages/` holds
further packages, built and tested on their own:

| Directory | Package | Tests |
|---|---|---|
| `.` | `@tradik/xslt-processor` | `npm test` |
| `packages/xslt3` | `@tradik/xslt3` (XSLT 3.0 / XPath 3.1, in development, [design](XSLT3.md)) | `npm run test:xslt3` |

`npm ci` at the root installs every package. A workspace never becomes a
dependency of `@tradik/xslt-processor`: its tarball holds only `dist/`,
`src/` and `bin/`.

## Docker

```bash
# Run tests in container
docker compose run --rm test

# Development with tests in watch mode
docker compose run --rm dev

# Build bundles into ./dist
docker compose run --rm build
```

## Publishing to npm

The package is published to npm automatically by the `Release` workflow when a
`v*` tag is pushed (or a GitHub release is published). Publishing uses npm
**Trusted Publishing** (OIDC): no token secret and no OTP are involved, and
every release carries provenance attestations. Tokens are not an option:
npm stops accepting 2FA-bypass granular tokens for publishing around January
2027 ([GitHub changelog](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)),
and a token that enforces 2FA fails in CI with `EOTP`.

**One-time prerequisite** (npmjs.com -> package `@tradik/xslt-processor` ->
Settings -> Trusted Publisher): provider *GitHub Actions*, owner `spagu`,
repository `XSLT-Processor`, workflow `release.yml`, environment left empty.
Until that is configured the `publish` job fails with `E404`, and the package
has to be published manually from the tag with
`npm publish --provenance --access public --otp=CODE`.

**Release process:**

```bash
# 1. Bump the version in package.json, package-lock.json, src/index.js and
#    add a CHANGELOG.md entry, then commit to main.

# 2. Tag and push the tag; the workflow refuses to publish if the tag does
#    not match package.json.
git tag v1.1.3
git push origin v1.1.3
```

**Automated workflow** (`.github/workflows/release.yml`):
1. `test`: lint, formatting check and tests on Node.js 22, 24 and 26
2. `build`: builds the distribution bundles and verifies the package contents (`npm pack --dry-run`)
3. `build`: checks that the tag matches the `package.json` version
4. `build`: uploads the `dist/` build artifacts to GitHub
5. `publish` (tags only): `npm publish --provenance --access public`

## Browser tests

The built bundles are tested in real browsers with Playwright (Chromium,
Firefox, WebKit):

```sh
npx playwright install --with-deps chromium firefox webkit   # once
npm run build && npm run test:browser                        # or: make test-browser
npm run test:browser -- --project=chromium                   # one engine
```

The tests cover the ESM and IIFE/CDN bundles, `installGlobal()`,
`transformToFragment` into the page document (real `HTMLElement`s),
`transformToDocument`, `transformToString`, parameters and the stylesheet and
document loaders. Where the browser still ships a native `XSLTProcessor`, a
differential test compares its output with this library's and prints a summary
table; it is informational and never fails the run. `BROWSER_DIFF_CORPUS=1`
adds the libxslt conformance corpus (`npm run conformance:fetch`), and
`BROWSER_DIFF_OUT=<dir>` writes the differences as JSON.

## Website

The project website (documentation, changelog and playground) lives in
`site/` and is built with [spagu/ssg](https://github.com/spagu/ssg). Pages are
generated from README.md, CHANGELOG.md and `docs/*.md`, so documentation is
edited in those files only.

```sh
make site                      # build into site/public and check links, meta tags and contrast
make site SSG=/path/to/ssg     # use a specific ssg binary
make site-serve                # preview on http://localhost:8888 with rebuilds
make site-test                 # unit tests of the content generator and checks
```

`make site` builds `site/public` for the published address,
`https://xslt-processor.tradik.com/`, whose canonical URLs, sitemap and Open
Graph tags point there. For a local preview use `make site-serve`, which builds
`site/public-local` for `http://localhost:8888/` from `site/ssg.local.yaml`; if
port 8888 is taken, ssg serves on the next free port and prints it.

The site is hosted on Cloudflare Pages, project `xslt-processor`
(`wrangler.toml`). `.github/workflows/site.yml` builds and checks it on every
pull request and deploys it on every push to `main`; it needs the repository
secrets `CLOUDFLARE_API_TOKEN` (permission Account > Cloudflare Pages > Edit)
and `CLOUDFLARE_ACCOUNT_ID`. `make site-deploy` deploys by hand after
`npx wrangler login`. The first deployment creates the Pages project in the account of
`CLOUDFLARE_ACCOUNT_ID` if it does not exist yet. The domain is attached to the project in the Cloudflare
dashboard (Workers & Pages > xslt-processor > Custom domains).

The old address, `https://spagu.github.io/XSLT-Processor/`, keeps working: the
same workflow publishes `site/redirect/index.html` to GitHub Pages as
`index.html` and `404.html`, which sends every old URL to the same path on
the new domain (Settings > Pages > Source stays "GitHub Actions").

The blog lives in `site/posts/`: one Markdown file per article, with
frontmatter `title`, `description` (also the summary in the list and the
feeds), `slug`, `status: publish`, `type: post` and `date` (ISO 8601; posts on
the same day are ordered by time). `build-content.mjs` copies the posts into
the ssg content, ssg publishes them at `/blog/<slug>/`, lists them on `/blog/`
(`site/pages/blog.md`, layout `layouts/blog.html`) and writes the feeds
`/blog/rss.xml` (RSS 2.0) and `/blog/feed.xml` (Atom). Charts for articles go
in `site/templates/xslt-site/images/blog/` as SVG with light and dark colours,
referenced relative to the post (`../../images/blog/chart.svg`). Don't add
`tags:` to posts: the theme has no tag archive template.

The playground has two modes, kept in the address (`?mode=xpath`) and
remembered in localStorage. XSLT 1.0 uses `dist/xslt-processor.browser.min.js`
(copied to `site/static/vendor/`, so run `npm run build` first). XPath 3.1 uses
`@tradik/xslt3`, which `site/scripts/vendor.mjs` bundles with esbuild from
`packages/xslt3/src/` into `site/static/vendor/xslt3.browser.min.js` (a
minified ES module; `npm run site:content` prints its size). The page loads it
with `import()` only when XPath 3.1 mode is opened. The mode logic lives in
`site/templates/xslt-site/js/` (`playground-modes.js`, `xpath-core.js`,
`xpath-items.js`, `xpath-presets.js`) and is tested by
`site/scripts/xpath.test.mjs` and `vendor.test.mjs`, which run every example.

The Google Tag Manager container id is a placeholder (`variables.gtm_id` in
`site/ssg.yaml`).

## DOM matrix

`npm run test:dom` (or `make test-dom`) runs the test suites, the CLI tests and
the conformance suite with jsdom and with @xmldom/xmldom.
`DOM=xmldom node --test <files>` runs any suite built on
`src/domEnvironment.test.js` with xmldom; mark jsdom-only tests with
`jsdomOnly("feature")`.

## Benchmarks

`npm run bench` (about 6 minutes) measures 1.1.3 against the working tree and writes `scripts/benchmark/results.json`; `node scripts/benchmark/charts.mjs` redraws `docs/benchmarks/*.svg` and the tables in [BENCHMARKS.md](BENCHMARKS.md).
