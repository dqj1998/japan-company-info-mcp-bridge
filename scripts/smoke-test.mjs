#!/usr/bin/env node
// Pre-publish smoke test — encodes the contract broken in the 1.2.1 incident:
// "a release must ship a runnable runtime binary for EVERY declared platform,
//  with versions aligned and the .orb bundle present."
//
// It checks the built artifacts (run `npm run prepare:runtime` first, or use
// `npm test` which does both), so a missing-binary / version-drift release fails
// loudly here instead of silently publishing a bridge that can't start.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'runtime-packages');
const MIN_BIN_BYTES = 1_000_000; // runtime binaries are ~12–18 MB; guards against empty/placeholder files

const errors = [];
const fail = (m) => errors.push(m);

const main = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const optDeps = main.optionalDependencies || {};

if (Object.keys(optDeps).length === 0) {
  fail('package.json has no optionalDependencies — main package would ship without any runtime binary.');
}
if (!existsSync(OUT)) {
  fail(`runtime-packages/ not found — run "npm run prepare:runtime" first (or "npm test").`);
}

if (existsSync(OUT)) {
  for (const [name, ver] of Object.entries(optDeps)) {
    // main must pin each runtime dep to its own version (they release in lockstep).
    if (ver !== main.version) {
      fail(`${name}: optionalDependencies pins ${ver}, but main is ${main.version} (version drift).`);
    }
    const dirName = name.split('/')[1]; // strip @scope
    const dir = join(OUT, dirName);
    const pj = join(dir, 'package.json');
    if (!existsSync(pj)) {
      fail(`${name}: no generated package at runtime-packages/${dirName}/ (prepare:runtime did not build it).`);
      continue;
    }
    const sub = JSON.parse(readFileSync(pj, 'utf8'));
    if (sub.name !== name) fail(`${dirName}: package name "${sub.name}" != expected "${name}".`);
    if (sub.version !== main.version) fail(`${name}: sub-package version ${sub.version} != main ${main.version}.`);
    if (!Array.isArray(sub.os) || sub.os.length === 0) fail(`${name}: missing os[] gate.`);
    if (!Array.isArray(sub.cpu) || sub.cpu.length === 0) fail(`${name}: missing cpu[] gate.`);

    const isWin = (sub.os || [])[0] === 'win32';
    const binName = isWin ? 'mcporb-runtime.exe' : 'mcporb-runtime';
    const bin = join(dir, binName);
    if (!existsSync(bin)) {
      fail(`${name}: runtime binary ${binName} missing.`);
    } else {
      const size = statSync(bin).size;
      if (size < MIN_BIN_BYTES) fail(`${name}: ${binName} is only ${size} bytes (looks empty/placeholder).`);
    }
    if (!(sub.files || []).includes(binName)) fail(`${name}: "${binName}" not in files[] — it would not be published.`);
    if (!existsSync(join(dir, 'NOTICE'))) fail(`${name}: NOTICE missing (license attribution for the binary).`);
  }
}

// The .orb bundle ships in the main package and must be present.
const orb = join(ROOT, 'assets', 'japan-company-info-free.orb.zip');
if (!existsSync(orb)) fail('assets/japan-company-info-free.orb.zip missing from main package.');
else if (statSync(orb).size === 0) fail('assets/japan-company-info-free.orb.zip is empty.');

if (errors.length) {
  console.error(`\n✗ smoke test FAILED (${errors.length}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

const platforms = Object.keys(optDeps).map((n) => n.split('-').slice(-2).join('-')).join(', ');
console.log(`✓ smoke test passed — v${main.version}, runtime binaries present for: ${platforms}; .orb bundle present.`);
