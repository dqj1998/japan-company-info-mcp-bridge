#!/usr/bin/env node
// Keep everything that pins the package version in lockstep with the main
// package.json version. Run automatically by the npm "version" lifecycle hook so
// `npm version <bump>` updates all of these in the same commit — otherwise the
// smoke test / MCP registry publish fail on drift.
//
// Synced:
//   1. package.json optionalDependencies for the per-platform runtime packages
//   2. server.json  .version  and  .packages[].version  (MCP Registry entry)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const pkgPath = join(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const V = pkg.version;

// 1) optionalDependencies
const od = pkg.optionalDependencies || {};
let odChanged = 0;
for (const k of Object.keys(od)) {
  if (k.startsWith('@dqj1998/japan-company-info-mcp-bridge-') && od[k] !== V) {
    od[k] = V;
    odChanged++;
  }
}
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 2) server.json (top-level version + each package version)
const serverPath = join(ROOT, 'server.json');
let srvChanged = 0;
if (existsSync(serverPath)) {
  const srv = JSON.parse(readFileSync(serverPath, 'utf8'));
  if (srv.version !== V) { srv.version = V; srvChanged++; }
  for (const p of srv.packages || []) {
    if (p.version !== V) { p.version = V; srvChanged++; }
  }
  writeFileSync(serverPath, JSON.stringify(srv, null, 2) + '\n');
}

console.log(`synced ${odChanged} optionalDependencies and ${srvChanged} server.json version field(s) to ${V}`);
