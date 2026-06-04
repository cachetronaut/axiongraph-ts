import type { GraphEvent } from '@axiongraph/core';
import { ConvexHttpClient } from 'convex/browser';
import { describe, expect, it } from 'vitest';
import { ConvexStore } from '../src/store';

// Live smoke test against a real Convex deployment that has the axiongraph component installed and
// the exposed functions deployed (the user's `convex dev`). Skipped unless CONVEX_URL is set, so
// CI/offline runs stay green. A unique runId keeps reruns from colliding on the persistent backend.
const CONVEX_URL = process.env.CONVEX_URL;

describe.skipIf(!CONVEX_URL)('ConvexStore (live deployment)', () => {
  it('round-trips events through the deployed component', async () => {
    const client = new ConvexHttpClient(CONVEX_URL as string);
    const store = new ConvexStore(client);
    const runId = `run_live_${Date.now()}`;

    const events: GraphEvent[] = [
      {
        id: `${runId}-e1`,
        runId,
        seq: 1,
        ts: '2026-06-03T00:00:00.000Z',
        type: 'node_created',
        node: { id: 'a', kind: 'agent', label: 'Live' },
      },
    ];
    await store.append(events);
    await store.append(events); // idempotent on (runId, seq)

    const state = await store.snapshot(runId);
    expect(state.nodes.get('a')?.label).toBe('Live');
    expect(state.seq).toBe(1);
  });
});
