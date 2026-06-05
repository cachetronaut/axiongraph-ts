import { type GraphEvent, type GraphState, type GraphStore, reduceAll } from '@axiongraph/core';
import { Pool, type PoolClient } from 'pg';
import {
  canonicalize,
  type Row,
  type ScanOptions,
  type StoreDriver,
  type Transaction,
} from '../../../../../dockbay/dockbay-ts/packages/core/src/index';

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
  private readonly driver: PostgresGraphDriver;
  private readonly ownsPool: boolean;

  /**
   * @param connection a Postgres connection string, or an existing `pg.Pool` to reuse. A pool
   *   created from a string is owned by the store and closed by {@link close}; a passed-in pool
   *   is left open.
   */
  constructor(connection: string | Pool, options: PostgresStoreOptions = {}) {
    const table = options.table ?? 'axiongraph_events';
    if (!IDENTIFIER.test(table)) {
      throw new Error(`Invalid Postgres table name: ${table}`);
    }
    if (typeof connection === 'string') {
      this.driver = new PostgresGraphDriver(new Pool({ connectionString: connection }), table);
      this.ownsPool = true;
    } else {
      this.driver = new PostgresGraphDriver(connection, table);
      this.ownsPool = false;
    }
  }

  async append(events: readonly GraphEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.driver.transaction(async (txn) => {
      for (const event of events) {
        await txn.upsert(this.driver.table, eventKey(event), { payload: event });
      }
    });
  }

  async *readEvents(runId: string, sinceSeq = 0): AsyncIterable<GraphEvent> {
    yield* await this.driver.transaction(async (txn) => {
      const events: GraphEvent[] = [];
      for await (const row of txn.scan(
        this.driver.table,
        { runId },
        { after: { runId, seq: sinceSeq } },
      )) {
        events.push(row.payload as GraphEvent);
      }
      return events;
    });
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
      await this.driver.close();
    }
  }
}

class PostgresGraphDriver implements StoreDriver {
  readonly backend = 'postgres';
  private ready?: Promise<void>;

  constructor(
    private readonly pool: Pool,
    readonly table: string,
  ) {}

  async transaction<T>(work: (txn: Transaction) => Promise<T>): Promise<T> {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new PostgresGraphTransaction(client, this.table));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

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
}

class PostgresGraphTransaction implements Transaction {
  constructor(
    private readonly client: PoolClient,
    private readonly eventTable: string,
  ) {}

  async upsert(table: string, key: Row, row: Row): Promise<void> {
    this.assertEventTable(table);
    await this.client.query(
      `INSERT INTO ${this.eventTable} (run_id, seq, payload)
       VALUES ($1, $2, $3) ON CONFLICT (run_id, seq) DO NOTHING`,
      [key.runId, key.seq, JSON.stringify(row.payload)],
    );
  }

  async get(table: string, key: Row): Promise<Row | undefined> {
    this.assertEventTable(table);
    const result = await this.client.query<{ payload: GraphEvent }>(
      `SELECT payload FROM ${this.eventTable} WHERE run_id = $1 AND seq = $2`,
      [key.runId, key.seq],
    );
    const payload = result.rows[0]?.payload;
    return payload === undefined ? undefined : { payload };
  }

  async *scan(table: string, prefix: Row, opts: ScanOptions = {}): AsyncIterable<Row> {
    this.assertEventTable(table);
    const afterSeq = typeof opts.after?.seq === 'number' ? opts.after.seq : 0;
    const limit = opts.limit;
    const result = await this.client.query<{ payload: GraphEvent }>(
      `SELECT payload FROM ${this.eventTable}
       WHERE run_id = $1 AND seq > $2 ORDER BY seq ${limit === undefined ? '' : 'LIMIT $3'}`,
      limit === undefined ? [prefix.runId, afterSeq] : [prefix.runId, afterSeq, limit],
    );
    for (const row of result.rows) {
      yield { payload: row.payload };
    }
  }

  async compareAndApply(table: string, key: Row, expect: unknown, next: unknown): Promise<boolean> {
    this.assertEventTable(table);
    const current = await this.get(table, key);
    if (canonicalize({ value: current?.payload }) !== canonicalize({ value: expect })) {
      return false;
    }
    if (current === undefined) {
      const inserted = await this.client.query(
        `INSERT INTO ${this.eventTable} (run_id, seq, payload)
         VALUES ($1, $2, $3) ON CONFLICT (run_id, seq) DO NOTHING`,
        [key.runId, key.seq, JSON.stringify(next)],
      );
      return inserted.rowCount === 1;
    }
    await this.client.query(
      `UPDATE ${this.eventTable} SET payload = $3 WHERE run_id = $1 AND seq = $2`,
      [key.runId, key.seq, JSON.stringify(next)],
    );
    return true;
  }

  private assertEventTable(table: string): void {
    if (table !== this.eventTable) {
      throw new Error(`Unknown Postgres graph table: ${table}`);
    }
  }
}

function eventKey(event: GraphEvent): Row {
  return { runId: event.runId, seq: event.seq };
}
