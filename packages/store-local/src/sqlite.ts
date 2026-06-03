import { createRequire } from 'node:module';
import { type GraphEvent, type GraphState, type GraphStore, reduceAll } from '@axiongraph/core';

// `node:sqlite` is a Node builtin, but bundlers/test runners (Vite) do not yet recognize it
// and try to resolve a bare `sqlite` module. Loading it through a native `require` keeps the
// specifier out of static analysis; the type import below is erased and never resolved.
const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');

/** A `SELECT payload` row. `node:sqlite` types each column as a broad union, so we narrow here. */
type PayloadRow = Record<string, unknown>;

function parseEvent(row: PayloadRow): GraphEvent {
  return JSON.parse(row.payload as string) as GraphEvent;
}

/**
 * A durable single-file {@link GraphStore} backed by Node's built-in `node:sqlite` (spec D4).
 * One `events` table keyed on `(run_id, seq)`; `append` uses `INSERT OR IGNORE` so it is
 * idempotent on `(runId, seq)`. No server, survives restarts. Snapshots live-fold the log.
 */
export class SqliteStore implements GraphStore {
  private readonly db: InstanceType<typeof DatabaseSync>;

  /** @param location a file path, or `:memory:` (the default) for an ephemeral database. */
  constructor(location = ':memory:') {
    this.db = new DatabaseSync(location);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS events (
         run_id  TEXT    NOT NULL,
         seq     INTEGER NOT NULL,
         payload TEXT    NOT NULL,
         PRIMARY KEY (run_id, seq)
       )`,
    );
  }

  async append(events: readonly GraphEvent[]): Promise<void> {
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO events (run_id, seq, payload) VALUES (?, ?, ?)',
    );
    for (const event of events) {
      insert.run(event.runId, event.seq, JSON.stringify(event));
    }
  }

  async *readEvents(runId: string, sinceSeq = 0): AsyncIterable<GraphEvent> {
    const rows = this.db
      .prepare('SELECT payload FROM events WHERE run_id = ? AND seq > ? ORDER BY seq')
      .all(runId, sinceSeq) as PayloadRow[];
    for (const row of rows) {
      yield parseEvent(row);
    }
  }

  async snapshot(runId: string): Promise<GraphState> {
    const rows = this.db
      .prepare('SELECT payload FROM events WHERE run_id = ? ORDER BY seq')
      .all(runId) as PayloadRow[];
    return reduceAll(runId, rows.map(parseEvent));
  }

  /** Release the underlying database handle. Not part of the {@link GraphStore} port. */
  close(): void {
    this.db.close();
  }
}
