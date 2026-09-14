# Releasing

Five packages ship together, all at the same version:

- `japan-company-info-mcp-bridge` (main, unscoped)
- `@dqj1998/japan-company-info-mcp-bridge-darwin-arm64`
- `@dqj1998/japan-company-info-mcp-bridge-linux-arm64`
- `@dqj1998/japan-company-info-mcp-bridge-linux-x64`
- `@dqj1998/japan-company-info-mcp-bridge-win32-x64`

The main package carries only `index.js`, the `.orb` bundle, and metadata; each
runtime sub-package carries one `mcporb-runtime` binary, gated by npm `os`/`cpu`,
and is referenced from the main package's `optionalDependencies`. A consumer's
`npm i` therefore pulls only the binary matching their host.

## Normal release (Trusted Publishing / OIDC — no tokens)

Prereq (one-time): each of the five packages has a Trusted Publisher configured on
npmjs.com pointing at `dqj1998/japan-company-info-mcp-bridge` + workflow
`release.yml` (see `.github/workflows/release.yml` header).

1. Bump `version` in **the main `package.json`** (sub-package versions are derived
   from it by `npm run prepare:runtime`).
2. Commit, then tag and push:
   ```bash
   git commit -am "vX.Y.Z"
   git tag vX.Y.Z
   git push origin main --tags
   ```
3. The `release` workflow runs: version-guard → `prepare:runtime` → publish the 4
   sub-packages → publish main. Provenance is attached automatically.

## Bootstrap / first publish (token required — OIDC cannot create a package)

Trusted Publishing can only be configured after a package exists, so the very first
publish of any of these package names must use a token:

```bash
npm config set //registry.npmjs.org/:_authToken=npm_xxxx   # short-lived granular token
npm run prepare:runtime
npm run publish:runtime        # 4 sub-packages
npm publish --access public    # main
npm config delete //registry.npmjs.org/:_authToken
# then revoke the token on npmjs.com
```

After this succeeds once, configure each package's Trusted Publisher on npmjs.com
and use the OIDC flow above for all future releases.
