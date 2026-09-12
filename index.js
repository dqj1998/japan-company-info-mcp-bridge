#!/usr/bin/env node
'use strict';

// MCP stdio bridge for the japan-company-info Free edition Orb.
//
// It launches the bundled `mcporb-runtime` binary in stdio-only mode against the
// pre-packaged Free Orb (192 blue-chip listed companies) and transparently pipes
// the MCP JSON-RPC stream between the host (Claude Desktop, Cursor, Glama) and the
// runtime. All retrieval runs locally; on first launch the runtime downloads its
// query-embedding model (~220MB) in the background for the `vector` method — until
// that completes, `bm25`/`trigram` (exact keyword, identifier, fuzzy) work offline.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RUNTIME_DIR = path.join(__dirname, 'bin');
const ORB_ZIP = path.join(__dirname, 'assets', 'japan-company-info-free.orb.zip');

// Resolve the platform-specific runtime binary (falls back to a generic name).
function resolveRuntime() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const specific = path.join(RUNTIME_DIR, `mcporb-runtime-${process.platform}-${process.arch}${ext}`);
  if (fs.existsSync(specific)) return specific;
  const generic = path.join(RUNTIME_DIR, `mcporb-runtime${ext}`);
  if (fs.existsSync(generic)) return generic;
  return null;
}

const bin = resolveRuntime();
if (!bin) {
  process.stderr.write(
    `[japan-company-info-mcp-bridge] No runtime binary for ${process.platform}-${process.arch}.\n` +
    `Bundled targets are listed in bin/. See README for building mcporb-runtime from source.\n`
  );
  process.exit(1);
}
if (!fs.existsSync(ORB_ZIP)) {
  process.stderr.write(`[japan-company-info-mcp-bridge] Missing Orb bundle: ${ORB_ZIP}\n`);
  process.exit(1);
}

// stdout stays a pure JSON-RPC channel; runtime logs go to our stderr via inherit.
const child = spawn(bin, ['--orb-zip', ORB_ZIP, '--stdio-only'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

child.on('error', (err) => {
  process.stderr.write(`[japan-company-info-mcp-bridge] Failed to start runtime: ${err.message}\n`);
  process.exit(1);
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);

const forward = (sig) => { try { child.kill(sig); } catch (_) { /* already gone */ } };
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code == null ? 0 : code));
});
