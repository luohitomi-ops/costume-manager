import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const vendorDir = path.join(root, 'public', 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

fs.copyFileSync(
  path.join(root, 'node_modules', 'html2canvas', 'dist', 'html2canvas.min.js'),
  path.join(vendorDir, 'html2canvas.min.js')
);

console.log('Copied html2canvas.min.js to public/vendor/');
