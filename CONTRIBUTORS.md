# Contributors

Thank you to everyone who has contributed to `@tradik/xslt-processor`!

## Maintainers

- **spagu** - Creator and lead maintainer

## How to Contribute

### Reporting Bugs

1. Check the [existing issues](https://github.com/spagu/XSLT-Processor/issues) first
2. Include a minimal XML document and XSLT stylesheet that reproduce the problem
3. Show the expected output (ideally from libxslt / Chrome or `xsltproc`) and the actual output
4. Mention the package version and the environment (browser, or Node.js version and DOM such as `jsdom`)

Security problems are reported privately, see [SECURITY.md](SECURITY.md).

### Feature Requests

1. Open an issue describing the use case
2. Reference the relevant section of the XSLT 1.0 or XPath 1.0 specification when applicable
3. Propose a solution if possible

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests first; keep coverage at or above the current level
4. Ensure all tests pass (`npm test`)
5. Run the linter and the formatter check (`npm run lint`, `npm run format:check`)
6. Build the bundles (`npm run build`) when the public API or the TypeScript declarations change
7. Update `README.md` and `CHANGELOG.md`
8. Commit with clear messages and open a Pull Request

### Development Setup

```bash
# Clone the repo
git clone https://github.com/spagu/XSLT-Processor.git
cd XSLT-Processor

# Install dependencies (Node.js 22+ recommended; the package supports >=20.19)
npm install

# Run tests with coverage
npm test

# Lint and check formatting
npm run lint
npm run format:check

# Build dist/ bundles and TypeScript declarations
npm run build
```

The same tasks are available as `make test`, `make lint`, `make build` and,
in Docker, `make docker-test`.

### Code Style

- ES modules, formatted with Prettier and checked with ESLint
- camelCase names; JSDoc on exported functions and classes
- One responsibility per module (see `src/xpath/` and `src/xslt/`)
- No runtime dependencies

### Areas for Contribution

- Bug fixes and XSLT/XPath conformance (see "Known Deviations" in the [README](README.md))
- Test coverage
- Documentation improvements
- Performance of large transformations

## Recognition

Contributors are recognized in:
- Release notes
- This file
- GitHub contributors page

## Code of Conduct

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md) in all interactions.

---

*Want to be listed here? Submit a pull request!*
