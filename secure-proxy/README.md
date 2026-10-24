# secure-proxy

A separate project from the Mornward app. It is not imported by the app, not built by Vite, and not scanned by the
app's network guards. Mornward stays strictly local-first (CLAUDE.md rule 4). Do not wire this into `src/`.

Node 20+, TypeScript 5.7+, Express 4, RS256 JWT via JWKS, Anthropic SDK 0.x, PostgreSQL.

```
npm install
npm run typecheck
npm test        # the data-boundary tests need PostgreSQL 16 on 127.0.0.1:54329 (trust auth, superuser "postgres")
```

| Path | Purpose |
| --- | --- |
| `src/middleware/auth.ts` | Bearer + RS256 verification against a JWKS endpoint, pinned issuer and audience, `req.user.id` |
| `src/middleware/rate-limit.ts` | Per-user token bucket behind a `RateLimitStore` interface (in-memory only, per instance) |
| `src/routes/routine.ts` | `POST /v1/routines/generate`: auth, rate limit, content type, 10kb parse, validate, handler |
| `src/services/data-boundary.ts` | Context lookup: user id bound as `$1`, row-level security, hard output cap |
| `src/routine-handler.ts` | Anthropic call via forced tool use, output validated with Zod, typed errors |
| `src/http/*` | Shared `ApiError`, terminal error middleware, request ids |
| `src/app.ts` | Middleware order |

Not written yet: `server.ts` (real Anthropic client, pg pool, env loading, server timeouts, graceful shutdown),
a shared rate-limit store, an edge rate limit before authentication, and the infrastructure (AWS).
