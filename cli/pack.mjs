// Builds dist/glass-extension-<version>.zip containing only what Chrome needs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, `glass-extension-${manifest.version}.zip`);
fs.rmSync(out, { force: true });
const include = ['manifest.json', 'icons', 'src', 'LICENSE', 'README.md', 'PRIVACY.md'];
execFileSync('zip', ['-r', '-q', out, ...include, '-x', 'src/**/*.test.*'], { cwd: root, stdio: 'inherit' });
console.log(`wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
