// WORLD GP — Worker przed statycznymi plikami gry. Jedyne API: POST /api/turn zwraca krótkotrwałe dane serwera
// TURN Cloudflare, żeby wyścig multiplayer szedł przez TURN i gracze nie poznawali swoich adresów IP.
// Sekrety (wrangler secret put): TURN_KEY_ID, TURN_KEY_API_TOKEN. Bez nich /api/turn zwraca 503, a gra
// przechodzi na przekaźnik przez Supabase.

const TTL = 4 * 3600; // dłużej niż najdłuższy weekend wyścigowy
const ORIGINS = ['https://world-gp.pl', 'https://www.world-gp.pl'];

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }
  });
}

// tylko strona gry (domena world-gp.pl albo ten sam host, np. podgląd PR) może pobierać dane TURN; reszta świata dostaje 403
function allowed(req, url) {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') === 'same-origin';
  return origin === url.origin || ORIGINS.includes(origin);
}

async function turn(req, env, url) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405, { allow: 'POST' });
  if (!allowed(req, url)) return json({ error: 'origin' }, 403);
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ error: 'turn_not_configured' }, 503);
  // limit na IP (lokalny dla lokalizacji Cloudflare): gra pobiera dane raz na godzinę na kartę
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  if (env.TURN_LIMIT && !(await env.TURN_LIMIT.limit({ key: 'turn:' + ip })).success) return json({ error: 'rate_limited' }, 429);
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: TTL })
  });
  if (!r.ok) return json({ error: 'turn_upstream', status: r.status }, 502);
  const d = await r.json();
  return json({ iceServers: d.iceServers || [] }, 200);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/turn') return turn(req, env, url);
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(req);
  }
};
