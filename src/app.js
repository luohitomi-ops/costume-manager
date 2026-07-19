import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import './db/connection.js';
import charactersRouter from './routes/characters.js';
import itemsRouter from './routes/items.js';
import exportRouter from './routes/export.js';
import categoriesRouter from './routes/categories.js';
import { requireAuth, checkPassword, sessionCookieValue, COOKIE_NAME } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.post('/login', (req, res) => {
  if (checkPassword(req.body?.password)) {
    res.cookie(COOKIE_NAME, sessionCookieValue(), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
    return res.status(200).json({ ok: true });
  }
  res.status(401).json({ error: 'wrong password' });
});

// Local self-hosting is designed to run with no password at all (see
// README's "Option A"); the password gate only makes sense once an
// ACCESS_PASSWORD is actually configured, which is the deploy-your-own
// cloud path (README's "Option B").
if (process.env.ACCESS_PASSWORD) {
  app.use(requireAuth);
}

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

app.use(express.static(path.join(baseDir, 'public')));

app.use('/api/characters', charactersRouter);
app.use('/api/items', itemsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api', exportRouter);

export default app;
