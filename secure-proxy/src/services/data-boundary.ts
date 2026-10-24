import { z } from 'zod';
import { MAX_CONTEXT_CHARS } from '../routine-handler.ts';

/* ------------------------------------------------------------------ */
/* Schema. Two independent controls keep one user's rows from another. */
/*   1. Every query binds the caller's id as a parameter (below).       */
/*   2. Row-level security rejects any row whose owner is not the id    */
/*      set for the current transaction, so a future query that forgets */
/*      the WHERE clause returns nothing instead of leaking.            */
/* The application role must NOT own the table and must NOT have        */
/* BYPASSRLS, otherwise the policy is skipped.                          */
/* ------------------------------------------------------------------ */

export const REQUIRED_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS routine_context_entries (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       text        NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 128),
  kind          text        NOT NULL CHECK (kind ~ '^[a-z_]{1,32}$'),
  body          text        NOT NULL CHECK (char_length(body) <= 2000),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED
);
CREATE INDEX IF NOT EXISTS routine_context_entries_owner_recent
  ON routine_context_entries (user_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS routine_context_entries_search
  ON routine_context_entries USING gin (search_vector);
ALTER TABLE routine_context_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_context_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS routine_context_owner_read ON routine_context_entries;
CREATE POLICY routine_context_owner_read ON routine_context_entries
  FOR SELECT USING (user_id = current_setting('app.user_id', true));
`;

/* ------------------------------------------------------------------ */
/* Database surface                                                    */
/* ------------------------------------------------------------------ */

/** The subset of a `pg` PoolClient used here. `pg.Pool` satisfies it structurally. */
export interface DbClient {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
  /** Passing an error makes the pool destroy the connection instead of reusing it. */
  release(err?: Error | boolean): void;
}

export interface DbPool {
  connect(): Promise<DbClient>;
}

export interface ContextBoundaryOptions {
  pool: DbPool;
  /** Absolute ceiling on the returned string, in UTF-16 code units. Clamped to the handler's own limit. */
  maxChars?: number;
}

const MAX_ROWS = 20;
const MAX_ENTRY_CHARS = 500;
const MAX_SEARCH_CHARS = 200;
const MIN_USEFUL_TAIL_CHARS = 40;
const STATEMENT_TIMEOUT_MS = 2_000;

// The caller's id is the first bound parameter ($1). Nothing from the user or the token is ever
// concatenated into SQL text, and the search text is passed through websearch_to_tsquery, which accepts
// arbitrary input without raising a syntax error.
const SELECT_ENTRIES_SQL = `
SELECT kind, body
FROM routine_context_entries
WHERE user_id = $1
  AND deleted_at IS NULL
ORDER BY
  (search_vector @@ websearch_to_tsquery('english', $2)) DESC,
  updated_at DESC,
  id DESC
LIMIT $3
`;

const SubjectSchema = z.string().min(1).max(128).regex(/^[\x21-\x7E]+$/);
const RowSchema = z.object({ kind: z.string().regex(/^[a-z_]{1,32}$/), body: z.string() });

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/gu;
const WHITESPACE_RUN = /\s+/g;

/**
 * One entry becomes one line. Collapsing whitespace means stored text cannot start a new line that looks
 * like another entry's `[kind]` label or like a separate instruction block.
 */
function toSingleLine(text: string): string {
  // Whitespace first: newlines and tabs are control characters, and stripping them before collapsing would fuse
  // the words on either side of them together.
  return text.replace(WHITESPACE_RUN, ' ').replace(CONTROL_OR_FORMAT, '').trim();
}

function cutToLength(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, Math.max(0, max));
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // never end on half a surrogate pair
  return cut;
}

/** Builds the prompt text from rows already scoped to one user, never exceeding `maxChars`. */
export function assembleContext(rows: ReadonlyArray<{ kind: string; body: string }>, maxChars: number): string {
  const lines: string[] = [];
  let used = 0;
  for (const row of rows) {
    const body = cutToLength(toSingleLine(row.body), MAX_ENTRY_CHARS);
    if (body.length === 0) continue;
    const line = `[${row.kind}] ${body}`;
    const cost = line.length + (lines.length === 0 ? 0 : 1); // +1 for the newline separator
    if (used + cost <= maxChars) {
      lines.push(line);
      used += cost;
      continue;
    }
    const room = maxChars - used - (lines.length === 0 ? 0 : 1);
    if (room >= MIN_USEFUL_TAIL_CHARS) lines.push(cutToLength(line, room));
    break;
  }
  return cutToLength(lines.join('\n'), maxChars);
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('database failure');
}

/**
 * Returns the `getProprietaryRoutineContext(userId, cleanInput)` function.
 * `userId` must be the verified token subject. It is validated again here because this module is the last
 * line of defence for the data.
 */
export function createContextProvider(options: ContextBoundaryOptions): (userId: string, cleanInput: string) => Promise<string> {
  const maxChars = Math.min(options.maxChars ?? MAX_CONTEXT_CHARS, MAX_CONTEXT_CHARS);
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError('maxChars must be a positive integer');

  return async function getProprietaryRoutineContext(userId: string, cleanInput: string): Promise<string> {
    const subject = SubjectSchema.safeParse(userId);
    if (!subject.success) throw new RangeError('invalid user id');
    const owner = subject.data;
    const searchText = cutToLength(toSingleLine(cleanInput), MAX_SEARCH_CHARS);

    const client = await options.pool.connect();
    let discard: Error | undefined;
    let rawRows: unknown[];
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      // is_local = true: the setting lives and dies with this transaction, so a pooled connection can never
      // carry one user's id into the next request.
      await client.query("SELECT set_config('app.user_id', $1, true)", [owner]);
      const result = await client.query(SELECT_ENTRIES_SQL, [owner, searchText, MAX_ROWS]);
      await client.query('COMMIT');
      rawRows = result.rows;
    } catch (cause) {
      discard = asError(cause);
      try {
        await client.query('ROLLBACK');
      } catch {
        // The connection is unusable. release(discard) below removes it from the pool.
      }
      throw cause;
    } finally {
      client.release(discard);
    }
    return assembleContext(z.array(RowSchema).parse(rawRows), maxChars);
  };
}
