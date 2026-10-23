// Copies the pipeline output (data/processed) into web/public/data so Vite can serve it.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../data/processed');
const dest = resolve(here, '../public/data');

if (!existsSync(resolve(src, 'terrain.json'))) {
  console.error('No processed data in data/processed.');
  console.error('Run from the repo root: python -m pipeline.build --area rudraprayag');
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Synced ${src} -> ${dest}`);
