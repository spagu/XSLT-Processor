.PHONY: install test test-watch build lint format clean docker-test docker-dev docker-build help

# Default target
help:
	@echo "Available targets:"
	@echo "  install      - Install dependencies"
	@echo "  test         - Run tests"
	@echo "  test-watch   - Run tests in watch mode"
	@echo "  build        - Build distribution bundles"
	@echo "  lint         - Run ESLint"
	@echo "  format       - Format code with Prettier"
	@echo "  clean        - Remove build artifacts"
	@echo "  docker-test  - Run tests in Docker"
	@echo "  docker-dev   - Start development container"
	@echo "  docker-build - Build using Docker"

# Install dependencies
install:
	npm ci

# Run tests
test:
	npm test

# Run tests in watch mode
test-watch:
	npm run test:watch

# Build distribution bundles
build:
	npm run build

# Run ESLint
lint:
	npm run lint

# Format code
format:
	npm run format

# Check formatting
format-check:
	npm run format:check

# Clean build artifacts
clean:
	rm -rf dist/
	rm -rf node_modules/
	rm -rf coverage/

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
