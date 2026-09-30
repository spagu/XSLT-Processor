.PHONY: install test test-watch test-browser test-dom conformance conformance-baseline build binaries binaries-all binaries-test binaries-smoke lint format format-check clean docker-test docker-dev docker-build docker-clean help site site-content site-serve site-test site-clean

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

# Generate site content from README.md, CHANGELOG.md and docs/*.md
site-content: build
	npm run site:content

# Production build (served under /XSLT-Processor/), then the site checks
site: site-content
	cd site && $(SSG) --config ssg.yaml
	node site/scripts/check-site.mjs site/public /XSLT-Processor
	@echo "site/public is built for https://spagu.github.io/XSLT-Processor/ (links start with /XSLT-Processor/),"
	@echo "so it is not styled when served from a server root. Preview locally with: make site-serve"

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
