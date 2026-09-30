const { createClient } = require('redis');

const client = createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
});

client.on('error', (err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'redis error', error: err.message }));
});

let connected = false;

async function connectRedis() {
  if (!connected) {
    await client.connect();
    connected = true;
  }
}

async function pingRedis() {
  await client.ping();
}

const TTL_SECONDS = 3600; // redirects are read-heavy and rarely change — cache aggressively

async function getCachedTarget(code) {
  return client.get(`link:${code}`);
}

async function setCachedTarget(code, targetUrl) {
  await client.set(`link:${code}`, targetUrl, { EX: TTL_SECONDS });
}

module.exports = { client, connectRedis, pingRedis, getCachedTarget, setCachedTarget };
