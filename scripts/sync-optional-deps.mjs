#!/usr/bin/env node
// Keep the main package's per-platform runtime optionalDependencies pinned to the
// main package's own version — they release in lockstep. Run automatically by the
// npm "version" lifecycle hook, so `npm version <bump>` updates both the version and
// the optionalDependencies in one commit (otherwise the smoke test fails on drift).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = join(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(p, 'utf8'));
const od = pkg.optionalDependencies || {};

let changed = 0;
for (const k of Object.keys(od)) {
  if (k.startsWith('@dqj1998/japan-company-info-mcp-bridge-') && od[k] !== pkg.version) {
    od[k] = pkg.version;
    changed++;
  }
}
writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
console.log(`synced ${changed} optionalDependencies to ${pkg.version}`);
