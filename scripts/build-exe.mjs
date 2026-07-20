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
const exePath = path.join(distDir, 'costume-manager.exe');
execSync(
  `npx pkg build/bundle.cjs --targets node22-win-x64 --output "${exePath}"`,
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

console.log('Removing dev-machine-ABI binary before fetching the packaged target\'s ABI...');
fs.rmSync(path.join(nativeModuleDest, 'build', 'Release'), { recursive: true, force: true });

console.log('Fetching Node 22 ABI prebuilt binary for better-sqlite3 (dev machine Node version does not match the packaged target — see Verified findings item 4)...');
// 22.23.1 is the exact Node point-release pkg's "node22-win-x64" target currently
// resolves to (found via pkg's own binary cache directory name under ~/.pkg-cache/v3.6/).
// The ABI (NODE_MODULE_VERSION 127) is what actually matters and is stable across all
// Node 22.x patches, but prebuild-install needs a version string, not a bare ABI number.
// If a future pkg/pkg-fetch update changes which patch version "node22-win-x64" resolves
// to, and this exact version has no published better-sqlite3 prebuild, re-check the cache
// directory name and update this string.
execSync('npx prebuild-install --target=22.23.1 --runtime=node --platform=win32 --arch=x64', {
  stdio: 'inherit',
  cwd: nativeModuleDest,
});

const nativeBinaryPath = path.join(nativeModuleDest, 'build', 'Release', 'better_sqlite3.node');
if (!fs.existsSync(nativeBinaryPath)) {
  throw new Error(
    `prebuild-install did not produce ${nativeBinaryPath} — the packaged exe would ship without a working native module. Aborting build.`
  );
}
console.log('Confirmed ABI-matched better-sqlite3 binary present.');

console.log('Copying schema.sql...');
fs.mkdirSync(path.join(distDir, 'db'), { recursive: true });
fs.copyFileSync(path.join(root, 'build', 'schema.sql'), path.join(distDir, 'db', 'schema.sql'));

console.log('Copying public/ assets...');
fs.cpSync(path.join(root, 'public'), path.join(distDir, 'public'), { recursive: true });

console.log('Writing hidden-window launcher (double-clicking the .exe directly shows a console window)...');
const launcherPath = path.join(distDir, '雙擊啟動.vbs');
fs.writeFileSync(
  launcherPath,
  [
    'Set objShell = CreateObject("WScript.Shell")',
    'strFolder = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\\"))',
    'objShell.Run """" & strFolder & "costume-manager.exe""", 0, False',
  ].join('\r\n'),
  'utf-8' // ASCII-only content — no BOM needed for VBS to parse this correctly
);

console.log('');
console.log(`Done. Distributable folder: ${distDir}`);
console.log('Zip the dist/ folder to share it with a friend.');
console.log('Tell them to double-click 雙擊啟動.vbs, not costume-manager.exe directly — the .vbs hides the console window.');
console.log('data/ was intentionally not included — first run creates a fresh, empty database.');
