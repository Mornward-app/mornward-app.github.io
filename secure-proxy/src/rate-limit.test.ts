import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryTokenBucket } from './middleware/rate-limit.ts';

test('burst, then deny with an accurate Retry-After, then refill', async () => {
  let t = 0;
  const s = createInMemoryTokenBucket({ capacity: 3, refillPerSecond: 0.1, maxKeys: 10, now: () => t });
  for (let i = 0; i < 3; i++) assert.deepEqual(await s.consume('a'), { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(await s.consume('a'), { allowed: false, retryAfterSeconds: 10 });
  t += 4_000;
  assert.deepEqual(await s.consume('a'), { allowed: false, retryAfterSeconds: 6 });
  t += 6_000;
  assert.equal((await s.consume('a')).allowed, true);
  assert.equal((await s.consume('a')).allowed, false);
});

test('users are independent and the bucket never exceeds capacity', async () => {
  let t = 0;
  const s = createInMemoryTokenBucket({ capacity: 2, refillPerSecond: 1, maxKeys: 10, now: () => t });
  await s.consume('a'); await s.consume('a');
  assert.equal((await s.consume('a')).allowed, false);
  assert.equal((await s.consume('b')).allowed, true);
  t += 1_000_000;
  assert.equal((await s.consume('a')).allowed, true);
  assert.equal((await s.consume('a')).allowed, true);
  assert.equal((await s.consume('a')).allowed, false);
});

test('memory is bounded: least recently used key is evicted first', async () => {
  const t = 0;
  const s = createInMemoryTokenBucket({ capacity: 1, refillPerSecond: 0.001, maxKeys: 2, now: () => t });
  await s.consume('a'); await s.consume('b');
  assert.equal((await s.consume('a')).allowed, false); // touches a, so b is now the oldest
  await s.consume('c'); // evicts b
  assert.equal((await s.consume('a')).allowed, false, 'a survived');
  assert.equal((await s.consume('b')).allowed, true, 'b was evicted and starts fresh');
});

test('invalid options are refused at construction', () => {
  for (const o of [{ capacity: 0, refillPerSecond: 1, maxKeys: 1 }, { capacity: 1, refillPerSecond: 0, maxKeys: 1 }, { capacity: 1, refillPerSecond: 1, maxKeys: 0 }, { capacity: NaN, refillPerSecond: 1, maxKeys: 1 }])
    assert.throws(() => createInMemoryTokenBucket(o), RangeError);
});
