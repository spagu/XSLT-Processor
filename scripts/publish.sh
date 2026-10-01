#!/usr/bin/env bash
# Publish @tradik/xslt-processor to npm by hand (make publish OTP=123456).
#
# The Release workflow publishes with Trusted Publishing when a GitHub release
# is created; this is the manual path for when that is not possible. It
# refuses to publish anything that is not exactly a tagged, tested release:
#
#   1. the working tree is clean and HEAD carries the tag v<version>;
#   2. that version is not on npm yet, and you are logged in (npm login);
#   3. the build, the tests and the conformance suite pass;
#   4. npm publish runs with the one-time password from your authenticator.
#
# DRY_RUN=1 runs every check and `npm publish --dry-run` (no OTP needed).
# Provenance attestations are only possible from CI, so manual releases have
# none.
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "publish: $*" >&2
  exit 1
}

name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version")
tag="v${version}"

[[ -z "$(git status --porcelain)" ]] || fail "the working tree has changes; commit or stash them first"
git rev-parse -q --verify "refs/tags/${tag}" >/dev/null || fail "tag ${tag} does not exist (git tag ${tag})"
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "${tag}^{commit}")" ]] || fail "HEAD is not ${tag}; check it out first (git checkout ${tag})"

if npm view "${name}@${version}" version >/dev/null 2>&1; then
  fail "${name}@${version} is already on npm"
fi

if [[ "${DRY_RUN:-0}" != "1" ]]; then
  npm whoami >/dev/null 2>&1 || fail "not logged in to npm (npm login)"
  [[ "${OTP:-}" =~ ^[0-9]{6}$ ]] || fail "OTP must be the 6-digit code from your authenticator: make publish OTP=123456"
fi

echo "publish: ${name}@${version} from ${tag} ($(git rev-parse --short HEAD))"
npm ci --ignore-scripts
npm run build
npm test
npm run conformance:fetch
npm run test:conformance

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  npm publish --dry-run --access public --ignore-scripts
  echo "publish: dry run done, nothing was published"
else
  npm publish --access public --ignore-scripts --otp="${OTP}"
  echo "publish: npm now has $(npm view "${name}" version)"
fi
