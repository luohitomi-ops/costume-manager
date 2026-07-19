import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import app from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Costume Manager running at ${url}`);

  if (typeof process.pkg !== 'undefined') {
    openAppWindow(url);
  }
});

/**
 * Opens Edge in --app mode (no address bar/tabs, looks like a real desktop
 * app instead of a browser tab) when Edge is at its standard install path.
 * Windows 10/11 ship Edge at this exact path regardless of OS bitness — see
 * https://learn.microsoft.com/en-us/answers/questions/878582 — so this
 * covers the vast majority of real machines without needing a registry
 * lookup. Falls back to the OS default browser if Edge isn't there.
 */
function openAppWindow(url) {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  if (existsSync(edgePath)) {
    execFile(edgePath, [`--app=${url}`]);
  } else {
    execFile('cmd', ['/c', 'start', '', url]);
  }
}

export default app;
