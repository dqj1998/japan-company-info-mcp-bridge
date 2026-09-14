#!/usr/bin/env bash
# Publish the per-platform runtime sub-packages, THEN the main package.
# Order matters: the main package lists these as optionalDependencies, so they must
# exist on npm first or a consumer's `npm i` cannot resolve the matching binary.
#
# Prereq: `npm login` (this script does NOT authenticate for you) and, for the first
# publish of the @dqj1998 scope, npm auto-creates it for the logged-in user.
#
# Usage: npm run publish:runtime   (after: npm run prepare:runtime)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/runtime-packages"

if [ ! -d "$OUT" ]; then
  echo "runtime-packages/ not found — run 'npm run prepare:runtime' first." >&2
  exit 1
fi

# In CI (OIDC trusted publishing) there is no persistent identity — `npm whoami`
# fails by design and npm mints a short-lived token per publish. Only enforce the
# login check for local/interactive (token-based) runs.
if [ "${CI:-}" != "true" ]; then
  if ! npm whoami >/dev/null 2>&1; then
    echo "Not logged in to npm. Run 'npm login', or set an automation/granular token." >&2
    exit 1
  fi
fi

for dir in "$OUT"/*/; do
  echo "== publishing $(basename "$dir") =="
  ( cd "$dir" && npm publish --access public )
done

echo
echo "All runtime packages published. Now publish the main package:"
echo "  cd \"$ROOT\" && npm publish --access public"
