#!/usr/bin/env bash
# Publish to npm by hand: @tradik/xslt-processor (make publish OTP=123456) or,
# with PACKAGE=xslt3, @tradik/xslt3 (make publish-xslt3 OTP=123456), or with
# PACKAGE=migrate-check, xslt-migrate-check (make publish-migrate-check). All
# are released from the same tag, v<version of the root package.json>.
#
# The Release workflow publishes with Trusted Publishing when a GitHub release
# is created; this is the manual path for when that is not possible. It
# refuses to publish anything that is not exactly a tagged, tested release:
#
#   1. the working tree is clean and HEAD carries the tag v<version>;
#   2. that version is not on npm yet, and you are logged in (npm login);
#   3. the build, the tests and the conformance suite pass;
#   4. npm publish runs with the one-time password from your authenticator
#      (or, on an empty answer, with npm's approval in the browser),
#      asked for after the tests (a code is valid for about 30 seconds, the
#      tests take minutes); OTP=123456 still works for scripted use.
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

tag="v$(node -p "require('./package.json').version")"
case "${PACKAGE:-root}" in
  root) manifest="./package.json" workspace=() ;;
  xslt3) manifest="./packages/xslt3/package.json" workspace=(--workspace @tradik/xslt3) ;;
  migrate-check) manifest="./packages/migrate-check/package.json" workspace=(--workspace xslt-migrate-check) ;;
  *) fail "PACKAGE must be root, xslt3 or migrate-check" ;;
esac
name=$(node -p "require('${manifest}').name")
version=$(node -p "require('${manifest}').version")

[[ -z "$(git status --porcelain)" ]] || fail "the working tree has changes; commit or stash them first"
git rev-parse -q --verify "refs/tags/${tag}" >/dev/null || fail "tag ${tag} does not exist (git tag ${tag})"
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "${tag}^{commit}")" ]] || fail "HEAD is not ${tag}; check it out first (git checkout ${tag})"

if npm view "${name}@${version}" version >/dev/null 2>&1; then
  fail "${name}@${version} is already on npm"
fi

if [[ "${DRY_RUN:-0}" != "1" ]]; then
  npm whoami >/dev/null 2>&1 || fail "not logged in to npm (npm login)"
  if [[ -n "${OTP:-}" && ! "${OTP}" =~ ^[0-9]{6}$ ]]; then
    fail "OTP must be the 6-digit code from your authenticator"
  fi
  [[ -n "${OTP:-}" || -t 0 ]] || fail "no terminal to ask for the one-time password: pass OTP=123456"
fi

echo "publish: ${name}@${version} from ${tag} ($(git rev-parse --short HEAD))"
npm ci --ignore-scripts
if [[ "${PACKAGE:-root}" == "migrate-check" ]]; then
  npm run test:migrate-check
elif [[ "${PACKAGE:-root}" == "xslt3" ]]; then
  npm run test:xslt3
  npm run test:suites:unit
  npm run suites:fetch
  npm run test:qt3
  npm run test:xslt30
else
  npm run build
  npm test
  npm run conformance:fetch
  npm run test:conformance
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  npm publish "${workspace[@]}" --dry-run --access public --ignore-scripts
  echo "publish: dry run done, nothing was published"
else
  # Asked only now, after the checks: one-time passwords expire in seconds.
  # An empty answer publishes without --otp: npm then asks you to approve
  # the publication in the browser (for a passkey or security key, or when
  # the authenticator is out of reach).
  # OTP= from make (no OTP given) means "not provided", ask
  [[ -n "${OTP:-}" ]] || unset OTP
  while [[ -z "${OTP+set}" || ( -n "${OTP}" && ! "${OTP}" =~ ^[0-9]{6}$ ) ]]; do
    read -rp "publish: 6-digit code from your authenticator for ${name}@${version} (Enter: approve in the browser): " OTP
  done
  if [[ -n "${OTP}" ]]; then
    npm publish "${workspace[@]}" --access public --ignore-scripts --otp="${OTP}"
  else
    npm publish "${workspace[@]}" --access public --ignore-scripts
  fi
  # A package published for the first time can take a minute to show up in
  # the registry's metadata; ask a few times before giving up on the check
  for _ in 1 2 3 4 5 6; do
    if published=$(npm view "${name}@${version}" version 2>/dev/null) && [[ -n "${published}" ]]; then
      echo "publish: npm now has ${name}@${published}"
      exit 0
    fi
    sleep 10
  done
  echo "publish: ${name}@${version} was published; the registry has not listed it yet (npm view ${name} version in a minute)"
fi
