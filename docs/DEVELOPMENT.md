# Development

How to set up a working copy of `@tradik/xslt-processor`, run the tests, lint
and build the bundles (locally, with the `Makefile` or in Docker) and publish a
release to npm. Contribution guidelines are in
[CONTRIBUTORS.md](../CONTRIBUTORS.md).

## Prerequisites

- Node.js 22+ (native test runner; CI runs 22, 24 and 26)
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
**Trusted Publishing** (OIDC): no `NPM_TOKEN` secret and no OTP are involved,
and every release carries provenance attestations. If an `NPM_TOKEN` secret
exists it takes precedence over OIDC, so remove it once Trusted Publishing is
configured.

**One-time prerequisite** (npmjs.com -> package `@tradik/xslt-processor` ->
Settings -> Trusted Publisher): provider *GitHub Actions*, owner `spagu`,
repository `XSLT-Processor`, workflow `release.yml`, environment left empty.
Alternatively add an `NPM_TOKEN` repository secret; the `publish` job passes it
as `NODE_AUTH_TOKEN`. The token has to be one that bypasses two-factor
authentication, otherwise the job fails with `EOTP` ("This operation requires a
one-time password") because no one can type a code in CI:

- a **Granular Access Token** with *Read and write* permission for this package, or
- a classic token of type **Automation**.

A classic **Publish** token still enforces 2FA and will not work. Without
either, the `publish` job fails with `E404` and the package must be published
manually with
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
