import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GraphEvent } from '@axiongraph/core';
import { runStoreContract } from '@axiongraph/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteStore } from '../src/sqlite';

// Each case gets a fresh in-memory database; the suite closes it in afterEach.
runStoreContract('SqliteStore (:memory:)', () => new SqliteStore());

describe('SqliteStore durability', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'axiongraph-sqlite-'));
    dbPath = join(dir, 'events.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists events across a reopen', async () => {
    const event: GraphEvent = {
      id: 'e1',
      runId: 'run_persist',
      seq: 1,
      ts: '2026-06-03T00:00:00.000Z',
      type: 'node_created',
      node: { id: 'a', kind: 'agent', label: 'Persisted' },
    };

    const writer = new SqliteStore(dbPath);
    await writer.append([event]);
    writer.close();

    const reader = new SqliteStore(dbPath);
    const state = await reader.snapshot('run_persist');
    reader.close();

    expect(state.nodes.get('a')?.label).toBe('Persisted');
    expect(state.seq).toBe(1);
  });
});
