import type { GraphEvent } from '@axiongraph/core';
import { runStoreContract } from '@axiongraph/testkit';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PostgresStore } from '../src/postgres';

// Live tests need a real Postgres; gate them on a connection-string env var so the default
// `pnpm test` run (no database) is green. CI provides a `postgres` service that sets it.
const url = process.env.AXIONGRAPH_TEST_POSTGRES_URL;

if (url) {
  const pool = new Pool({ connectionString: url });
  const tables: string[] = [];
  let counter = 0;

  // Each contract case gets a fresh, uniquely named table → full isolation on a shared pool.
  runStoreContract('PostgresStore', () => {
    const table = `axiongraph_test_${process.pid}_${counter++}`;
    tables.push(table);
    return new PostgresStore(pool, { table });
  });

  describe('PostgresStore durability', () => {
    it('persists events across a new store on the same table', async () => {
      const table = `axiongraph_test_persist_${process.pid}`;
      tables.push(table);
      const event: GraphEvent = {
        id: 'e1',
        runId: 'run_persist',
        seq: 1,
        ts: '2026-06-03T00:00:00.000Z',
        type: 'node_created',
        node: { id: 'a', kind: 'agent', label: 'Persisted' },
      };

      const writer = new PostgresStore(pool, { table });
      await writer.append([event]);

      const reader = new PostgresStore(pool, { table });
      const state = await reader.snapshot('run_persist');

      expect(state.nodes.get('a')?.label).toBe('Persisted');
      expect(state.seq).toBe(1);
    });
  });

  afterAll(async () => {
    for (const table of tables) {
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await pool.end();
  });
} else {
  describe.skip('PostgresStore (set AXIONGRAPH_TEST_POSTGRES_URL to run)', () => {
    it('skipped without a live Postgres', () => {});
  });
}
