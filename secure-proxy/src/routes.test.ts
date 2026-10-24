import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { createAuthMiddleware } from './middleware/auth.ts';
import { createInMemoryTokenBucket, createRateLimitMiddleware, type RateLimitStore } from './middleware/rate-limit.ts';
import { RoutineError, createRoutineHandler, type Routine, type RoutineCall } from './routine-handler.ts';
import { AUDIENCE, ISSUER, makeKey, memoryLogger, sign, startJwks } from './test-support.ts';

const key = makeKey('k1');
const routine: Routine = { routineTitle: 'Calm start', steps: [{ timeAllocationMinutes: 5, actionableInstruction: 'Drink water.' }] };
const unhandled: unknown[] = [];
process.on('unhandledRejection', (r) => { unhandled.push(r); });

async function boot(opts: { generate?: (c: RoutineCall) => Promise<Routine>; store?: RateLimitStore; capacity?: number } = {}) {
  const jwks = await startJwks([key]);
  const logger = memoryLogger();
  const calls: RoutineCall[] = [];
  const generate = opts.generate ?? (async (c) => { calls.push(c); return routine; });
  const wrapped = async (c: RoutineCall) => { if (opts.generate) calls.push(c); return generate(c); };
  const store = opts.store ?? createInMemoryTokenBucket({ capacity: opts.capacity ?? 100, refillPerSecond: 1, maxKeys: 100 });
  const app = createApp({
    logger,
    authenticate: createAuthMiddleware({ jwksUri: jwks.url, issuer: ISSUER, audience: AUDIENCE, clockToleranceSeconds: 5 }, { logger }),
    rateLimit: createRateLimitMiddleware(store, logger),
    generate: opts.generate ? wrapped : generate,
  });
  const server: Server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (init: { token?: string | null; body?: string; type?: string | null; path?: string; method?: string }) => {
    const headers: Record<string, string> = {};
    const token = init.token === undefined ? sign(key, { sub: 'user-1' }) : init.token;
    if (token !== null) headers['authorization'] = `Bearer ${token}`;
    if (init.type !== null) headers['content-type'] = init.type ?? 'application/json';
    const res = await fetch(base + (init.path ?? '/v1/routines/generate'), { method: init.method ?? 'POST', headers, ...(init.method === 'GET' ? {} : { body: init.body ?? JSON.stringify({ input: 'wake at 7' }) }) });
    const text = await res.text();
    return { status: res.status, text, json: text.startsWith('{') ? JSON.parse(text) : null, res };
  };
  return { post, calls, logger, base, close: async () => { await new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections(); }); await jwks.close(); } };
}

test('happy path: identity comes from the token, never the body', async () => {
  const s = await boot();
  try {
    const r = await s.post({ token: sign(key, { sub: 'real-user' }) });
    assert.equal(r.status, 200); assert.deepEqual(r.json, { routine });
    assert.equal(r.res.headers.get('cache-control'), 'no-store');
    assert.match(r.res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
    assert.equal(r.res.headers.get('x-powered-by'), null);
    const call = s.calls[0]!;
    assert.equal(call.userId, 'real-user'); assert.equal(call.rawUserInput, 'wake at 7'); assert.ok(call.signal instanceof AbortSignal);
    assert.equal(call.requestId, r.res.headers.get('x-request-id'));
    const spoof = await s.post({ body: JSON.stringify({ input: 'x', userId: 'someone-else' }) });
    assert.equal(spoof.status, 400); assert.equal(s.calls.length, 1, 'a body that names a user never reaches the handler');
  } finally { await s.close(); }
});

test('unauthenticated callers never reach the parser: a 5 MB body is a 401, not a 413', async () => {
  const s = await boot();
  try {
    const r = await s.post({ token: null, body: 'x'.repeat(5_000_000) });
    assert.equal(r.status, 401); assert.equal(s.calls.length, 0);
  } finally { await s.close(); }
});

test('body boundary: size, type, syntax, shape', async () => {
  const s = await boot();
  try {
    const big = await s.post({ body: JSON.stringify({ input: 'x'.repeat(11_000) }) });
    assert.equal(big.status, 413); assert.equal(big.json.error.code, 'PAYLOAD_TOO_LARGE');
    assert.equal((await s.post({ type: 'text/plain' })).status, 415);
    assert.equal((await s.post({ type: null })).status, 415);
    assert.equal((await s.post({ type: 'application/json; charset=iso-8859-1' })).status, 415);
    assert.equal((await s.post({ type: 'application/json; charset=utf-16' })).status, 400, 'decodes to garbage, fails to parse');
    const syntax = await s.post({ body: '{"input": "SECRET-FRAGMENT' });
    assert.equal(syntax.status, 400); assert.ok(!syntax.text.includes('SECRET-FRAGMENT'), 'parse errors must not echo the body');
    for (const b of ['[]', '"str"', 'null', '{}', '{"input":5}', '{"input":null}', '{"input":"a","extra":1}', '{"__proto__":{"input":"a"}}'])
      assert.equal((await s.post({ body: b })).status, 400, b);
    assert.equal(s.calls.length, 0);
    assert.equal((await s.post({ path: '/v1/routines/generate', method: 'GET' })).status, 404);
    assert.equal((await s.post({ path: '/nope' })).status, 404);
  } finally { await s.close(); }
});

test('end to end with the real handler: input over the 2,000 character rule is a 400 and never reaches the model', async () => {
  let upstream = 0;
  const generate = createRoutineHandler({
    client: { messages: { create: async () => { upstream++; return { stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'tool_use', id: 't', name: 'submit_routine', input: routine }] } as never; } } },
    model: 'm', userIdHmacKey: 'k'.repeat(40), logger: memoryLogger(), getContext: async () => 'ctx',
  });
  const s = await boot({ generate: async (c) => generate(c) });
  try {
    const long = await s.post({ body: JSON.stringify({ input: 'x'.repeat(9_000) }) });
    assert.equal(long.status, 400); assert.equal(long.json.error.code, 'INVALID_INPUT'); assert.equal(upstream, 0);
    const ok = await s.post({});
    assert.equal(ok.status, 200); assert.deepEqual(ok.json, { routine }); assert.equal(upstream, 1);
  } finally { await s.close(); }
});

test('rate limit: per user, 429 with Retry-After, handler not reached', async () => {
  const s = await boot({ capacity: 2 });
  try {
    assert.equal((await s.post({})).status, 200); assert.equal((await s.post({})).status, 200);
    const denied = await s.post({});
    assert.equal(denied.status, 429); assert.equal(denied.json.error.code, 'RATE_LIMITED'); assert.equal(denied.json.error.retryable, true);
    assert.ok(Number(denied.res.headers.get('retry-after')) >= 1);
    assert.equal((await s.post({ token: sign(key, { sub: 'user-2' }) })).status, 200, 'another user is unaffected');
    assert.equal(s.calls.length, 3);
  } finally { await s.close(); }
});

test('rate limit store failure fails closed with 503', async () => {
  const s = await boot({ store: { consume: () => Promise.reject(new Error('redis password=hunter2')) } });
  try {
    const r = await s.post({});
    assert.equal(r.status, 503); assert.ok(!r.text.includes('hunter2'));
    assert.ok(!s.logger.lines.join('\n').includes('hunter2'));
  } finally { await s.close(); }
});

test('rejections from the handler become fixed responses and never an unhandled rejection', async () => {
  const before = unhandled.length;
  for (const [name, err, status, code] of [
    ['typed', new RoutineError('UPSTREAM_BUSY'), 503, 'UPSTREAM_BUSY'],
    ['raw error', new Error('pg: password authentication failed for user "app"'), 500, 'INTERNAL'],
    ['non-error value', 'string thrown' as unknown as Error, 500, 'INTERNAL'],
  ] as const) {
    const s = await boot({ generate: async () => { throw err; } });
    try {
      const r = await s.post({});
      assert.equal(r.status, status, name); assert.equal(r.json.error.code, code, name);
      assert.ok(!r.text.includes('password') && !r.text.includes('string thrown'), name);
      assert.ok(!s.logger.lines.join('\n').includes('password authentication'), `${name}: log must not carry the raw message`);
    } finally { await s.close(); }
  }
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(unhandled.length, before, 'no unhandled rejections');
});

test('a synchronous throw inside the handler is also contained', async () => {
  const s = await boot({ generate: () => { throw new Error('sync boom'); } });
  try { const r = await s.post({}); assert.equal(r.status, 500); assert.equal(r.json.error.code, 'INTERNAL'); }
  finally { await s.close(); }
});

test('client disconnect aborts the upstream call', async () => {
  let signal: AbortSignal | undefined; let started!: () => void;
  const startedP = new Promise<void>((r) => { started = r; });
  const s = await boot({ generate: (c) => new Promise<Routine>((_, rej) => { signal = c.signal; started(); c.signal?.addEventListener('abort', () => rej(new RoutineError('CANCELLED'))); }) });
  try {
    const ac = new AbortController();
    const req = fetch(s.base + '/v1/routines/generate', { method: 'POST', signal: ac.signal, headers: { authorization: `Bearer ${sign(key)}`, 'content-type': 'application/json' }, body: JSON.stringify({ input: 'x' }) }).catch(() => 'aborted');
    await startedP; ac.abort(); await req;
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(signal?.aborted, true);
  } finally { await s.close(); }
});
