import { execFile } from 'node:child_process';
import app from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Costume Manager running at ${url}`);

  if (typeof process.pkg !== 'undefined') {
    execFile('cmd', ['/c', 'start', '', url]);
  }
});

export default app;
