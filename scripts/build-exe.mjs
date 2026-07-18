import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

console.log('Cleaning dist/...');
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

console.log('Packaging bundle with pkg...');
execSync(
  `npx pkg build/bundle.cjs --targets node22-win-x64 --output "${path.join(distDir, 'costume-manager.exe')}"`,
  { stdio: 'inherit', cwd: root }
);

console.log('Copying better-sqlite3 native module and its dependencies...');
const nativeModuleDest = path.join(distDir, 'native_modules', 'better-sqlite3');
fs.mkdirSync(nativeModuleDest, { recursive: true });
fs.cpSync(path.join(root, 'node_modules', 'better-sqlite3'), nativeModuleDest, {
  recursive: true,
});
const nativeModuleDepsDest = path.join(nativeModuleDest, 'node_modules');
fs.mkdirSync(nativeModuleDepsDest, { recursive: true });
fs.cpSync(path.join(root, 'node_modules', 'bindings'), path.join(nativeModuleDepsDest, 'bindings'), {
  recursive: true,
});
fs.cpSync(
  path.join(root, 'node_modules', 'file-uri-to-path'),
  path.join(nativeModuleDepsDest, 'file-uri-to-path'),
  { recursive: true }
);

console.log('Fetching Node 22 ABI prebuilt binary for better-sqlite3 (dev machine Node version does not match the packaged target — see Verified findings item 4)...');
execSync('npx prebuild-install --target=22.23.1 --runtime=node --platform=win32 --arch=x64', {
  stdio: 'inherit',
  cwd: nativeModuleDest,
});

console.log('Copying schema.sql...');
fs.mkdirSync(path.join(distDir, 'db'), { recursive: true });
fs.copyFileSync(path.join(root, 'build', 'schema.sql'), path.join(distDir, 'db', 'schema.sql'));

console.log('Copying public/ assets...');
fs.cpSync(path.join(root, 'public'), path.join(distDir, 'public'), { recursive: true });

console.log('');
console.log(`Done. Distributable folder: ${distDir}`);
console.log('Zip the dist/ folder to share it with a friend.');
console.log('data/ was intentionally not included — first run creates a fresh, empty database.');
