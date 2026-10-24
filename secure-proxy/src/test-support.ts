import { createHmac, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import type { Logger } from './http/logger.ts';

export const ISSUER = 'https://idp.example.test/';
export const AUDIENCE = 'mornward-api';

export interface TestKey { kid: string; privatePem: string; publicKey: KeyObject }

export function makeKey(kid: string): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKey };
}

export interface JwksServer { url: string; hits: () => number; setKeys(keys: TestKey[]): void; close(): Promise<void> }

export async function startJwks(initial: TestKey[]): Promise<JwksServer> {
  let keys = initial;
  let hits = 0;
  const server: Server = createServer((req, res) => {
    hits++;
    if (req.url !== '/jwks.json') { res.writeHead(404).end(); return; }
    const body = JSON.stringify({ keys: keys.map((k) => ({ ...k.publicKey.export({ format: 'jwk' }), kid: k.kid, use: 'sig', alg: 'RS256' })) });
    res.writeHead(200, { 'content-type': 'application/json' }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/jwks.json`,
    hits: () => hits,
    setKeys: (k) => { keys = k; },
    close: () => new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections(); }),
  };
}

export function sign(key: TestKey, claims: Record<string, unknown> = {}, noExp = false): string {
  const payload = { sub: 'user-1', iss: ISSUER, aud: AUDIENCE, ...claims };
  const options: jwt.SignOptions = { algorithm: 'RS256', keyid: key.kid };
  if (!noExp && !('exp' in claims)) options.expiresIn = '5m';
  return jwt.sign(payload, key.privatePem, options);
}

const b64 = (o: unknown): string => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

/** HS256 token whose secret is the RSA public key text: the classic algorithm-confusion attack. */
export function confusionToken(key: TestKey): string {
  const head = b64({ alg: 'HS256', typ: 'JWT', kid: key.kid });
  const body = b64({ sub: 'attacker', iss: ISSUER, aud: AUDIENCE, exp: Math.floor(Date.now() / 1000) + 300 });
  const pem = key.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return `${head}.${body}.${createHmac('sha256', pem).update(`${head}.${body}`).digest('base64url')}`;
}

export function unsigned(kid: string, claims: Record<string, unknown>): string {
  return `${b64({ alg: 'none', typ: 'JWT', kid })}.${b64(claims)}.AAAA`;
}

export function memoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const push = (f: Record<string, unknown>, m: string): void => { lines.push(JSON.stringify([f, m])); };
  return { lines, info: push, warn: push, error: push };
}
