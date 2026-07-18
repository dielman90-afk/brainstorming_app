import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { generateIdeas } from './ai-core.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    mock: process.env.MOCK_AI === '1',
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
  });
});

app.post('/api/generate', async (req, res) => {
  try {
    const { action, ...payload } = req.body ?? {};
    const result = await generateIdeas(action, payload);
    res.json(result);
  } catch (err) {
    console.error(`[api] ${err.message}`);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API-Proxy läuft auf http://localhost:${port}`);
  if (process.env.MOCK_AI === '1') {
    console.log('MOCK_AI=1 – es werden statische Beispiel-Ideen geliefert.');
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠ ANTHROPIC_API_KEY ist nicht gesetzt – KI-Funktionen liefern einen Fehler. Siehe .env.example');
  }
});
