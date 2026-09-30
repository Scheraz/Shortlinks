const express = require('express');
const { customAlphabet } = require('nanoid');
const { pool, initSchema, pingDb } = require('./db');
const { connectRedis, pingRedis, getCachedTarget, setCachedTarget } = require('./cache');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Unambiguous alphabet (no 0/O/1/l confusion) — matters for a URL people
// will actually type or read aloud.
const genCode = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 7);

function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ level, msg, time: new Date().toISOString(), ...extra }));
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log('info', 'request', { method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - start });
  });
  next();
});

// Liveness — process-only, never touches Postgres/Redis, so a stalled
// dependency never causes a restart loop.
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Readiness — verifies real dependencies; K8s pulls the pod from Service
// endpoints (not a restart) when this fails.
app.get('/ready', async (req, res) => {
  try {
    await pingDb();
    await pingRedis();
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    log('warn', 'readiness check failed', { error: err.message });
    res.status(503).json({ status: 'not ready', error: err.message });
  }
});

// Create a short link
app.post('/links', async (req, res) => {
  const { target_url } = req.body;
  if (!target_url) {
    return res.status(400).json({ error: 'target_url is required' });
  }
  try {
    new URL(target_url); // throws on invalid URL
  } catch {
    return res.status(400).json({ error: 'target_url must be a valid URL' });
  }

  try {
    const code = genCode();
    await pool.query('INSERT INTO links (code, target_url) VALUES ($1, $2)', [code, target_url]);
    res.status(201).json({ code, target_url, short_url: `${req.protocol}://${req.get('host')}/${code}` });
  } catch (err) {
    log('error', 'failed to create link', { error: err.message });
    res.status(500).json({ error: 'internal error' });
  }
});

// Stats for a link (must be registered before the redirect catch-all below)
app.get('/links/:code/stats', async (req, res) => {
  try {
    const result = await pool.query('SELECT code, target_url, click_count, created_at FROM links WHERE code = $1', [req.params.code]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(result.rows[0]);
  } catch (err) {
    log('error', 'failed to fetch stats', { error: err.message });
    res.status(500).json({ error: 'internal error' });
  }
});

// Redirect — the hot path. Cache-first to keep Postgres load low on
// read-heavy traffic; click count still increments on every real hit.
app.get('/:code', async (req, res) => {
  const { code } = req.params;
  try {
    let targetUrl = await getCachedTarget(code);
    let cacheStatus = 'HIT';

    if (!targetUrl) {
      const result = await pool.query('SELECT target_url FROM links WHERE code = $1', [code]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'short link not found' });
      targetUrl = result.rows[0].target_url;
      await setCachedTarget(code, targetUrl);
      cacheStatus = 'MISS';
    }

    pool.query('UPDATE links SET click_count = click_count + 1 WHERE code = $1', [code]).catch((err) =>
      log('error', 'failed to increment click count', { error: err.message })
    );

    res.set('X-Cache', cacheStatus);
    res.redirect(302, targetUrl);
  } catch (err) {
    log('error', 'redirect failed', { error: err.message });
    res.status(500).json({ error: 'internal error' });
  }
});

let server;

async function start() {
  await connectRedis();
  await initSchema();
  server = app.listen(PORT, () => log('info', `shortlink listening on port ${PORT}`));
}

async function shutdown(signal) {
  log('info', `received ${signal}, shutting down gracefully`);
  if (server) server.close(() => log('info', 'http server closed'));
  try {
    await pool.end();
  } catch (err) {
    log('error', 'error closing pg pool', { error: err.message });
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  log('error', 'failed to start server', { error: err.message });
  process.exit(1);
});
