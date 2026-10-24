import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { apiErrorMiddleware } from './http/api-error.ts';
import { assignRequestId } from './http/request-id.ts';
import { createAuthMiddleware, createJwksKeyProvider, extractBearerToken, loadAuthConfig, requireUser, type AuthConfig, type KeyLookupError } from './middleware/auth.ts';
import { AUDIENCE, ISSUER, confusionToken, makeKey, memoryLogger, sign, startJwks, unsigned } from './test-support.ts';

const k1 = makeKey('k1');
const k2 = makeKey('k2');
const stranger = makeKey('k1'); // same kid, different key material

async function boot(jwksUrl: string) {
  const logger = memoryLogger();
  const config: AuthConfig = { jwksUri: jwksUrl, issuer: ISSUER, audience: AUDIENCE, clockToleranceSeconds: 5 };
  const reached: Array<{ id: string; frozen: boolean }> = [];
  const app = express();
  app.use(assignRequestId);
  app.get('/p', createAuthMiddleware(config, { logger }), (req, res) => {
    const u = requireUser(req);
    reached.push({ id: u.id, frozen: Object.isFrozen(u) });
    res.json({ id: u.id });
  });
  app.get('/unprotected', (req, res) => { try { requireUser(req); res.json({}); } catch (e) { res.status(500).json({ code: (e as { code?: string }).code }); } });
  app.use(apiErrorMiddleware(logger));
  const server: Server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (auth?: string, path = '/p') => {
    const res = await fetch(base + path, { headers: auth === undefined ? {} : { authorization: auth } });
    return { status: res.status, body: (await res.json()) as any, www: res.headers.get('www-authenticate'), retry: res.headers.get('retry-after') };
  };
  return { get, reached, logger, close: () => new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections(); }) };
}

test('config loader: https only, names but never values', () => {
  const ok = { AUTH_JWKS_URI: 'https://idp.example.test/.well-known/jwks.json', AUTH_ISSUER: ISSUER, AUTH_AUDIENCE: AUDIENCE };
  assert.deepEqual(loadAuthConfig(ok), { jwksUri: ok.AUTH_JWKS_URI, issuer: ISSUER, audience: AUDIENCE, clockToleranceSeconds: 30 });
  for (const bad of [{ ...ok, AUTH_JWKS_URI: 'http://idp.example.test/jwks' }, { ...ok, AUTH_ISSUER: '' }, { ...ok, AUTH_AUDIENCE: undefined }, { ...ok, AUTH_CLOCK_TOLERANCE_SECONDS: '999' }]) {
    assert.throws(() => loadAuthConfig(bad as any), (e: Error) => /^Invalid auth configuration: AUTH_/.test(e.message) && !e.message.includes('idp.example.test'));
  }
});

test('bearer extraction is strict', () => {
  const t = sign(k1);
  assert.equal(extractBearerToken(`Bearer ${t}`), t);
  assert.equal(extractBearerToken(`bearer ${t}`), t);
  for (const h of [undefined, '', 'Bearer', 'Bearer ', `Basic ${t}`, `Bearer ${t} extra`, `Bearer  ${t}`, `Bearer a.b`, 'Bearer a.b.c.d', `Bearer ${'a'.repeat(5000)}.b.c`, `Bearer ${t}\n`]) assert.equal(extractBearerToken(h), null, String(h).slice(0, 30));
});

test('accepts a valid RS256 token and exposes only the verified sub', async () => {
  const jwks = await startJwks([k1]); const s = await boot(jwks.url);
  try {
    const r = await s.get(`Bearer ${sign(k1, { sub: 'auth0|abc123' })}`);
    assert.equal(r.status, 200); assert.equal(r.body.id, 'auth0|abc123');
    assert.deepEqual(s.reached, [{ id: 'auth0|abc123', frozen: true }]);
  } finally { await s.close(); await jwks.close(); }
});

test('rejects every bad token with the same 401, before the route runs', async () => {
  const jwks = await startJwks([k1]); const s = await boot(jwks.url);
  try {
  const now = Math.floor(Date.now() / 1000);
  const cases: Record<string, string> = {
    expired: sign(k1, { exp: now - 600 }),
    'wrong issuer': sign(k1, { iss: 'https://evil.test/' }),
    'wrong audience': sign(k1, { aud: 'other-api' }),
    'no exp': sign(k1, {}, true),
    'not yet valid': sign(k1, { nbf: now + 600 }),
    'no sub': sign(k1, { sub: undefined }),
    'control char sub': sign(k1, { sub: 'a\u0000b' }),
    'unicode sub': sign(k1, { sub: 'ünï' }),
    'space sub': sign(k1, { sub: 'a b' }),
    'huge sub': sign(k1, { sub: 'x'.repeat(129) }),
    'numeric sub': sign(k1, { sub: 12345 }),
    'signed by other key, same kid': sign(stranger),
    'unknown kid': sign(k2),
    'alg confusion HS256': confusionToken(k1),
    'alg none': unsigned('k1', { sub: 'x', iss: ISSUER, aud: AUDIENCE, exp: now + 300 }),
    'tampered payload': (() => { const [h, , sig] = sign(k1).split('.'); return `${h}.${Buffer.from(JSON.stringify({ sub: 'admin', iss: ISSUER, aud: AUDIENCE, exp: now + 300 })).toString('base64url')}.${sig}`; })(),
  };
    for (const [name, token] of Object.entries(cases)) {
      const r = await s.get(`Bearer ${token}`);
      assert.equal(r.status, 401, name);
      assert.deepEqual(r.body, { error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.', retryable: false } }, name);
      assert.equal(r.www, 'Bearer realm="api", error="invalid_token"', name);
    }
    const none = await s.get(undefined);
    assert.equal(none.status, 401); assert.equal(none.www, 'Bearer realm="api"');
    assert.equal((await s.get('Basic abc')).status, 401);
    assert.equal(s.reached.length, 0, 'route handler must never run');
    const logs = s.logger.lines.join('\n');
    assert.ok(!logs.includes('evil.test') && !logs.includes('admin') && !logs.includes('attacker'), 'logs must not echo attacker-supplied text');
  } finally { await s.close(); await jwks.close(); }
});

test('IdP outage is a 503, not a 401, and cached keys keep working', async () => {
  const jwks = await startJwks([k1]); const s = await boot(jwks.url);
  try {
    assert.equal((await s.get(`Bearer ${sign(k1)}`)).status, 200); // warms the cache
    await jwks.close();
    assert.equal((await s.get(`Bearer ${sign(k1)}`)).status, 200, 'cached key still verifies');
    const r = await s.get(`Bearer ${sign(k2)}`); // not cached, IdP down
    assert.equal(r.status, 503); assert.equal(r.body.error.code, 'AUTH_UNAVAILABLE'); assert.equal(r.body.error.retryable, true); assert.equal(r.retry, '5');
  } finally { await s.close(); await jwks.close().catch(() => undefined); }
});

test('key rotation: a new kid is fetched, an old cached kid keeps verifying', async () => {
  const jwks = await startJwks([k1]); const s = await boot(jwks.url);
  try {
    assert.equal((await s.get(`Bearer ${sign(k1)}`)).status, 200);
    jwks.setKeys([k1, k2]);
    assert.equal((await s.get(`Bearer ${sign(k2)}`)).status, 200);
    assert.equal((await s.get(`Bearer ${sign(k1)}`)).status, 200);
  } finally { await s.close(); await jwks.close(); }
});

test('random-kid flood is capped at the JWKS fetch limit', async () => {
  const jwks = await startJwks([k1]); const s = await boot(jwks.url);
  try {
    assert.equal((await s.get(`Bearer ${sign(k1)}`)).status, 200); // a legitimate user warms the cache first
    const before = jwks.hits();
    for (let i = 0; i < 30; i++) await s.get(`Bearer ${sign({ ...k2, kid: `rand-${i}` })}`);
    assert.ok(jwks.hits() - before <= 10, `IdP was hit ${jwks.hits() - before} times`);
    assert.equal((await s.get(`Bearer ${sign(k1)}`)).status, 200, 'a cached key still verifies while the fetch limit is exhausted');
  } finally { await s.close(); await jwks.close(); }
});

test('warm() preloads keys so a cold instance survives an unknown-kid flood and an IdP outage', async () => {
  const jwks = await startJwks([k1]);
  const provider = createJwksKeyProvider({ jwksUri: jwks.url });
  try {
    await provider.warm();
    await jwks.close();
    assert.match(await provider('k1'), /BEGIN PUBLIC KEY/);
    await assert.rejects(provider('nope'), (e: KeyLookupError) => e.kind === 'unavailable');
  } finally { await jwks.close().catch(() => undefined); }
});

test('stale-if-error: a loaded key survives an outage for a bounded time, then stops', async () => {
  const jwks = await startJwks([k1]);
  let t = 1_000_000;
  const provider = createJwksKeyProvider({ jwksUri: jwks.url, freshMs: 600_000, staleIfErrorMs: 3_600_000, now: () => t });
  try {
    await provider.warm();
    await jwks.close();
    t += 700_000; // past fresh, refresh fails, still inside the stale window
    assert.match(await provider('k1'), /BEGIN PUBLIC KEY/);
    t += 3_000_000; // past the stale window
    await assert.rejects(provider('k1'), (e: KeyLookupError) => e.kind === 'unavailable');
  } finally { await jwks.close().catch(() => undefined); }
});

test('a key removed upstream stops verifying after the next refresh', async () => {
  const jwks = await startJwks([k1, k2]);
  let t = 0;
  const provider = createJwksKeyProvider({ jwksUri: jwks.url, freshMs: 1_000, now: () => t });
  try {
    await provider.warm();
    assert.ok(await provider('k2'));
    jwks.setKeys([k1]); t += 2_000;
    await assert.rejects(provider('k2'), (e: KeyLookupError) => e.kind === 'unknown_kid');
  } finally { await jwks.close(); }
});

test('concurrent lookups share one fetch', async () => {
  const jwks = await startJwks([k1]);
  const provider = createJwksKeyProvider({ jwksUri: jwks.url });
  try {
    await Promise.all(Array.from({ length: 25 }, () => provider('k1')));
    assert.equal(jwks.hits(), 1);
  } finally { await jwks.close(); }
});

test('requireUser on an unprotected route is a server error', async () => {
  const jwks = await startJwks([k1]); const s = await boot(jwks.url);
  try { const r = await s.get(undefined, '/unprotected'); assert.equal(r.status, 500); assert.equal(r.body.code, 'INTERNAL'); }
  finally { await s.close(); await jwks.close(); }
});
