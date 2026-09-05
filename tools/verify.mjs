// Ein Kommando für einen kompletten Prüfdurchlauf:
//   Build → Screenshots (Insel + Regressionsbilder) → Messung → Budget-Urteil.
//
//   node tools/verify.mjs <run-id> [env]   z.B. node tools/verify.mjs run-01 zen
//
// Bilder landen in tools/shots/<run-id>/, Messwerte in tools/metrics/<run-id>.json.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './harness-common.mjs';

const runId = process.argv[2] || 'latest';
const envId = process.argv[3] || 'zen';
const step = (label, fn) => {
  process.stdout.write(`\n=== ${label} ===\n`);
  return fn();
};

let buildOk = true;
step('npm run build', () => {
  try {
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
    process.stdout.write('✓ Build grün\n');
  } catch (err) {
    buildOk = false;
    process.stdout.write('✗ Build FEHLGESCHLAGEN\n');
    process.stdout.write((err.stdout || '') + (err.stderr || ''));
  }
});
if (!buildOk) process.exit(1);

let shotsOk = true;
step('Screenshots', () => {
  try {
    const out = execFileSync('node', ['tools/screenshots.mjs', '--out', `tools/shots/${runId}`, '--env', envId, '--all-envs'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    process.stdout.write(out);
  } catch (err) {
    shotsOk = false;
    process.stdout.write((err.stdout || '') + (err.stderr || ''));
  }
});

step('Messung', () => {
  const out = execFileSync('node', ['tools/measure.mjs', '--out', `tools/metrics/${runId}.json`, '--env', envId], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  process.stdout.write(out.split('\n').filter((l) => !l.startsWith('[vite]')).join('\n'));
});

// Vergleich mit dem Ausgangsstand
const BASE_ID = { island: 'run-00', zen: 'zen-00', night: 'night-00' };
const basePath = path.join(ROOT, `tools/metrics/${BASE_ID[envId] ?? `${envId}-00`}.json`);
const nowPath = path.join(ROOT, `tools/metrics/${runId}.json`);
if (fs.existsSync(basePath) && fs.existsSync(nowPath) && basePath !== nowPath) {
  const a = JSON.parse(fs.readFileSync(basePath, 'utf8')).summary;
  const b = JSON.parse(fs.readFileSync(nowPath, 'utf8')).summary;
  process.stdout.write(`\n=== Gegen ${path.basename(basePath, '.json')} ===\n`);
  for (const k of ['drawCallsMax', 'trianglesMax', 'programs', 'textureMB', 'renderMsWorst']) {
    process.stdout.write(`${k.padEnd(14)} ${String(a[k]).padStart(9)} → ${String(b[k]).padStart(9)}\n`);
  }
}

process.stdout.write(`\nStatus: Build ${buildOk ? 'OK' : 'FEHLER'}, Konsole ${shotsOk ? 'sauber' : 'MELDUNGEN'}\n`);
process.exit(buildOk && shotsOk ? 0 : 1);
