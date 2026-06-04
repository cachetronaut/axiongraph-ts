import type { GraphEvent } from '@axiongraph/core';
import { runStoreContract } from '@axiongraph/testkit';
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import componentSchema from '../component/schema';
import { type ConvexClientLike, type ConvexReactiveClientLike, ConvexStore } from '../src/store';
import hostSchema from './convex/schema';

// `convex-test` runs the real component + the host's exposed functions in-memory, so the shared
// store contract runs against the actual append/readEvents code paths — no live deployment.
// Vitest runs on the host (not the install sandbox), so this works in-session.
function makeStore(): ConvexStore {
  const t = convexTest(hostSchema, import.meta.glob('./convex/**/*.ts'));
  t.registerComponent('axiongraph', componentSchema, import.meta.glob('./component/**/*.ts'));
  return new ConvexStore(t as unknown as ConvexClientLike);
}

runStoreContract('ConvexStore (convex-test)', makeStore);

function nodeCreated(runId: string, seq: number, id: string): GraphEvent {
  return {
    id: `${runId}-e${seq}`,
    runId,
    seq,
    ts: '2026-06-03T00:00:00.000Z',
    type: 'node_created',
    node: { id, kind: 'agent', label: id.toUpperCase() },
  };
}

describe('ConvexStore.subscribe', () => {
  it('requires a reactive client', () => {
    const store = makeStore(); // convex-test client has no onUpdate
    const iterator = store.subscribe('run_x')[Symbol.asyncIterator]();
    return expect(iterator.next()).rejects.toThrow(/reactive client/);
  });

  it('yields each new event once past the high-water seq as the query refires', async () => {
    // A hand-driven reactive client: `refire` plays the role of Convex re-running `readEvents`,
    // which returns every event past the original `sinceSeq`. The store must dedupe by seq.
    let emit: ((events: GraphEvent[]) => void) | undefined;
    const reactive: ConvexReactiveClientLike = {
      onUpdate(_query, _args, callback) {
        emit = (events) => callback(events as never);
        return () => {
          emit = undefined;
        };
      },
    };
    const store = new ConvexStore({} as ConvexClientLike, { reactive });

    const iterator = store.subscribe('run_sub', 0)[Symbol.asyncIterator]();
    const seen: number[] = [];

    const pending1 = iterator.next(); // registers onUpdate, parks waiting for the first refire
    emit?.([nodeCreated('run_sub', 1, 'a'), nodeCreated('run_sub', 2, 'b')]);
    seen.push((await pending1).value.seq);
    seen.push((await iterator.next()).value.seq);

    const pending3 = iterator.next(); // parked again
    // The refired query returns the full list (1..3); only seq 3 is new.
    emit?.([
      nodeCreated('run_sub', 1, 'a'),
      nodeCreated('run_sub', 2, 'b'),
      nodeCreated('run_sub', 3, 'c'),
    ]);
    seen.push((await pending3).value.seq);

    expect(seen).toEqual([1, 2, 3]);
  });
});
