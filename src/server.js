import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db/connection.js';
import charactersRouter from './routes/characters.js';
import itemsRouter from './routes/items.js';
import exportRouter from './routes/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/characters', charactersRouter);
app.use('/api/items', itemsRouter);
app.use('/api', exportRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Costume Manager running at http://localhost:${PORT}`);
});

export default app;
