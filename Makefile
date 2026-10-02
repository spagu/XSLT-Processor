.PHONY: install test test-watch test-browser test-dom conformance conformance-baseline build binaries binaries-all binaries-test binaries-smoke lint format format-check clean docker-test docker-dev docker-build docker-clean help site site-content site-serve site-test site-clean site-deploy publish publish-dry publish-xslt3 publish-xslt3-dry

# Default target
help:
	@echo "Available targets:"
	@echo "  install      - Install dependencies"
	@echo "  test         - Run tests"
	@echo "  test-watch   - Run tests in watch mode"
	@echo "  test-browser - Build, then run Playwright tests in Chromium, Firefox and WebKit"
	@echo "  test-dom     - Run the test suites and conformance with jsdom and @xmldom/xmldom"
	@echo "  conformance  - Run the XSLT 1.0 conformance suite (libxslt corpus)"
	@echo "  conformance-baseline - Rewrite the conformance baseline"
	@echo "  build        - Build distribution bundles"
	@echo "  binaries     - Build the standalone xslt executable for this machine (dist-bin/)"
	@echo "  binaries-all - Cross-build all standalone executables (darwin ones unsigned)"
	@echo "  binaries-test  - Test the standalone binary scripts and install.sh"
	@echo "  binaries-smoke - Smoke test the executables in dist-bin/"
	@echo "  lint         - Run ESLint"
	@echo "  format       - Format code with Prettier"
	@echo "  clean        - Remove build artifacts"
	@echo "  docker-test  - Run tests in Docker"
	@echo "  docker-dev   - Start development container"
	@echo "  docker-build - Build using Docker"
	@echo "  site         - Build the project website into site/public (needs ssg)"
	@echo "  site-serve   - Preview the website on http://localhost:8888 with rebuilds"
	@echo "  site-test    - Test the website's content scripts and playground"
	@echo "  site-clean   - Remove the website's generated files"
	@echo "  site-deploy  - Build and deploy the website to Cloudflare Pages"
	@echo "  publish      - Publish the tagged release to npm by hand (asks for the OTP after the tests)"
	@echo "  publish-dry  - Every publish check and npm publish --dry-run, nothing published"
	@echo "  publish-xslt3 - Publish @tradik/xslt3 from the same release tag (asks for the OTP after the tests)"
	@echo "  publish-xslt3-dry - The same checks for @tradik/xslt3 and a dry run"

# Install dependencies
install:
	npm ci

# Run tests
test:
	npm test

# Run tests in watch mode
test-watch:
	npm run test:watch

# Browser tests (Playwright); install engines once with
# `npx playwright install --with-deps chromium firefox webkit`
test-browser: build
	npm run test:browser

# DOM test matrix: suites and conformance per DOM implementation
test-dom:
	npm run test:dom

# XSLT 1.0 conformance suite (downloads the corpus on first run)
conformance:
	npm run test:conformance:unit
	npm run test:conformance

# Rewrite tests/conformance/baseline.json from the current results
conformance-baseline:
	npm run test:conformance -- --update-baseline

# Build distribution bundles
build:
	npm run build

# Standalone xslt executable for this machine (Node.js SEA, needs Node.js 25.5+)
binaries:
	node scripts/binaries/build.mjs --target host

# Cross-build every target; darwin binaries need `codesign --sign -` on a Mac
binaries-all:
	node scripts/binaries/build.mjs --target all

# Tests of scripts/binaries and scripts/install.sh
binaries-test:
	node --test "scripts/binaries/*.test.mjs"

# Smoke test dist-bin/xslt-<os>-<arch> of this machine
binaries-smoke:
	node scripts/binaries/smoke.mjs

# Run ESLint
lint:
	npm run lint

# Format code
format:
	npm run format

# Check formatting
format-check:
	npm run format:check

# Project website (spagu/ssg, https://github.com/spagu/ssg). SSG may point
# at a binary outside PATH: make site SSG=/path/to/ssg
SSG ?= ssg
# Wrangler release used by site-deploy; keep in sync with .github/workflows/site.yml
WRANGLER_VERSION ?= 4.144.0

# Generate site content from README.md, CHANGELOG.md and docs/*.md
site-content: build
	npm run site:content

# Production build for https://xslt-processor.tradik.com/, then the site checks
site: site-content
	cd site && $(SSG) --config ssg.yaml
	node site/scripts/check-site.mjs site/public
	@echo "site/public is built for https://xslt-processor.tradik.com/. Preview locally with: make site-serve"

# Deploy site/public to Cloudflare Pages (wrangler.toml). Needs a Cloudflare
# login (npx wrangler login) or CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
site-deploy: site
	cd site/public && npx --yes wrangler@$(WRANGLER_VERSION) pages deploy . --project-name=xslt-processor --branch=main

# Local preview at the server root, rebuilt on change
site-serve: site-content
	@echo "Preview: http://localhost:8888/ (ssg moves to the next free port if 8888 is taken)"
	cd site && $(SSG) --config ssg.local.yaml --http --watch

# Unit tests of the content scripts and the playground core
site-test:
	npm run test:site

# Remove generated site files
site-clean:
	rm -rf site/content site/data site/static/vendor site/public site/public-local site/.ssg-cache

# Clean build artifacts
clean:
	rm -rf dist/
	rm -rf dist-bin/
	rm -rf node_modules/
	rm -rf coverage/
	rm -rf test-results/ playwright-report/

# Docker: Run tests
docker-test:
	docker-compose run --rm test

# Docker: Start development container
docker-dev:
	docker-compose run --rm dev

# Docker: Build distribution
docker-build:
	docker-compose run --rm build

# Docker: Clean up
docker-clean:
	docker-compose down -v --rmi local

# Publish @tradik/xslt-processor to npm by hand, from a clean checkout of the
# release tag (git checkout v<version>), with the one-time password of your
# npm account, asked for after the checks (or OTP=123456; Enter without a
# code approves in the browser). Checks, build and tests are in
# scripts/publish.sh.
publish:
	OTP=$(OTP) bash scripts/publish.sh

# The same checks and an npm publish --dry-run (no OTP, nothing published)
publish-dry:
	DRY_RUN=1 bash scripts/publish.sh

# @tradik/xslt3 (packages/xslt3), from the same release tag
publish-xslt3:
	PACKAGE=xslt3 OTP=$(OTP) bash scripts/publish.sh

publish-xslt3-dry:
	PACKAGE=xslt3 DRY_RUN=1 bash scripts/publish.sh
