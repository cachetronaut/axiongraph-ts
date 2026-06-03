import { type GraphEvent, type GraphState, type GraphStore, reduceAll } from '@axiongraph/core';
import { Pool } from 'pg';

/** Plain or schema-unqualified SQL identifier; interpolated into DDL, so it must be validated. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface PostgresStoreOptions {
  /** Table that holds the event log. Default `axiongraph_events`. Must be a plain identifier. */
  readonly table?: string;
}

/**
 * A durable {@link GraphStore} backed by Postgres (spec D4). One table keyed on
 * `(run_id, seq)`; `append` uses `INSERT ... ON CONFLICT DO NOTHING` so it is idempotent on
 * `(runId, seq)` (spec D3). The full event is stored as `jsonb`; snapshots live-fold the log.
 *
 * `pg` is an optional peer dependency — install it alongside `axiongraph` to use this adapter.
 * Realtime `subscribe` is intentionally omitted (the commercial seam, spec D4).
 */
export class PostgresStore implements GraphStore {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;
  private readonly table: string;
  private ready?: Promise<void>;

  /**
   * @param connection a Postgres connection string, or an existing `pg.Pool` to reuse. A pool
   *   created from a string is owned by the store and closed by {@link close}; a passed-in pool
   *   is left open.
   */
  constructor(connection: string | Pool, options: PostgresStoreOptions = {}) {
    if (typeof connection === 'string') {
      this.pool = new Pool({ connectionString: connection });
      this.ownsPool = true;
    } else {
      this.pool = connection;
      this.ownsPool = false;
    }
    this.table = options.table ?? 'axiongraph_events';
    if (!IDENTIFIER.test(this.table)) {
      throw new Error(`Invalid Postgres table name: ${this.table}`);
    }
  }

  /** Create the table once per instance; awaited at the top of every operation. */
  private ensureReady(): Promise<void> {
    this.ready ??= this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS ${this.table} (
           run_id  text   NOT NULL,
           seq     bigint NOT NULL,
           payload jsonb  NOT NULL,
           PRIMARY KEY (run_id, seq)
         )`,
      )
      .then(() => undefined);
    return this.ready;
  }

  async append(events: readonly GraphEvent[]): Promise<void> {
    await this.ensureReady();
    if (events.length === 0) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const text = `INSERT INTO ${this.table} (run_id, seq, payload)
                    VALUES ($1, $2, $3) ON CONFLICT (run_id, seq) DO NOTHING`;
      for (const event of events) {
        await client.query(text, [event.runId, event.seq, JSON.stringify(event)]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async *readEvents(runId: string, sinceSeq = 0): AsyncIterable<GraphEvent> {
    await this.ensureReady();
    const result = await this.pool.query<{ payload: GraphEvent }>(
      `SELECT payload FROM ${this.table} WHERE run_id = $1 AND seq > $2 ORDER BY seq`,
      [runId, sinceSeq],
    );
    for (const row of result.rows) {
      // `jsonb` is returned already parsed by `pg`, unlike the text column in the sqlite store.
      yield row.payload;
    }
  }

  async snapshot(runId: string): Promise<GraphState> {
    const events: GraphEvent[] = [];
    for await (const event of this.readEvents(runId)) {
      events.push(event);
    }
    return reduceAll(runId, events);
  }

  /** Close the pool if this store created it. Not part of the {@link GraphStore} port. */
  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }
}
