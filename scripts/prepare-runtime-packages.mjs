#!/usr/bin/env node
// Materialize per-platform runtime sub-packages from bin/ into runtime-packages/.
// Each sub-package ships exactly ONE mcporb-runtime binary, gated by npm's os/cpu
// fields, and is referenced by the main package via optionalDependencies — so a
// consumer's `npm i` downloads only the binary matching their host, instead of all
// four (~59 MB) bundled into the main tarball.
//
// Run: npm run prepare:runtime   (then npm run publish:runtime)
// Idempotent: regenerates runtime-packages/ from scratch each run.

import { readFileSync, writeFileSync, copyFileSync, rmSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ROOT, 'bin');
const OUT = join(ROOT, 'runtime-packages');
const SCOPE = '@dqj1998';
const BASE = 'japan-company-info-mcp-bridge';

const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// source binary in bin/  ->  { os, cpu, out (name inside sub-package) }
const TARGETS = [
  { src: 'mcporb-runtime-darwin-arm64',    os: 'darwin', cpu: 'arm64', out: 'mcporb-runtime' },
  { src: 'mcporb-runtime-linux-arm64',     os: 'linux',  cpu: 'arm64', out: 'mcporb-runtime' },
  { src: 'mcporb-runtime-linux-x64',       os: 'linux',  cpu: 'x64',   out: 'mcporb-runtime' },
  { src: 'mcporb-runtime-win32-x64.exe',   os: 'win32',  cpu: 'x64',   out: 'mcporb-runtime.exe' },
];

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const published = [];
for (const t of TARGETS) {
  const srcPath = join(BIN, t.src);
  if (!existsSync(srcPath)) {
    throw new Error(`Missing binary ${t.src} in bin/ — cannot build ${t.os}-${t.cpu} package.`);
  }
  const name = `${SCOPE}/${BASE}-${t.os}-${t.cpu}`;
  const dir = join(OUT, `${BASE}-${t.os}-${t.cpu}`);
  mkdirSync(dir, { recursive: true });

  const pkg = {
    name,
    version,
    description: `mcporb-runtime binary for ${BASE} (${t.os} ${t.cpu}). Not MIT — see NOTICE.`,
    license: 'SEE LICENSE IN NOTICE',
    os: [t.os],
    cpu: [t.cpu],
    files: [t.out, 'NOTICE'],
    repository: { type: 'git', url: `git+https://github.com/dqj1998/${BASE}.git` },
    homepage: 'https://mcporb.store/orb-pages/japan-company-info',
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  const dst = join(dir, t.out);
  copyFileSync(srcPath, dst);
  chmodSync(dst, 0o755);
  copyFileSync(join(ROOT, 'NOTICE'), join(dir, 'NOTICE'));

  published.push(name);
  console.log(`✓ ${name}@${version}  (${t.out})`);
}

console.log(`\nPrepared ${published.length} runtime packages in runtime-packages/ at v${version}.`);
console.log('Next: npm run publish:runtime   (publishes these, THEN publish the main package).');
