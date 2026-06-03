import { canonicalize, type GraphEvent, type GraphStore, reduceAll } from '@axiongraph/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** A store the suite may also be able to close (sqlite/postgres); the port itself has no `close`. */
type ClosableStore = GraphStore & { close?: () => void | Promise<void> };

const RUN = 'run_contract';
const OTHER = 'run_other';

function nodeCreated(runId: string, seq: number, id: string, label: string): GraphEvent {
  return {
    id: `${runId}-e${seq}`,
    runId,
    seq,
    ts: '2026-06-03T00:00:00.000Z',
    type: 'node_created',
    node: { id, kind: 'agent', label },
  };
}

async function collect(events: AsyncIterable<GraphEvent>): Promise<GraphEvent[]> {
  const out: GraphEvent[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
}

/**
 * The one shared suite every {@link GraphStore} adapter must pass, proving adapters are
 * interchangeable (spec §Testability "Store contract"). Run it against each implementation.
 */
export function runStoreContract(label: string, makeStore: () => ClosableStore): void {
  describe(`GraphStore contract: ${label}`, () => {
    let store: ClosableStore;

    beforeEach(() => {
      store = makeStore();
    });

    afterEach(async () => {
      await store.close?.();
    });

    it('returns an empty state for a run with no events', async () => {
      const state = await store.snapshot(RUN);
      expect(state.seq).toBe(0);
      expect(state.nodes.size).toBe(0);
      expect(state.edges.size).toBe(0);
    });

    it('folds appended events into the snapshot', async () => {
      const events = [nodeCreated(RUN, 1, 'a', 'A'), nodeCreated(RUN, 2, 'b', 'B')];
      await store.append(events);
      const state = await store.snapshot(RUN);
      expect(canonicalize(state)).toBe(canonicalize(reduceAll(RUN, events)));
    });

    it('is idempotent on (runId, seq) across repeated appends', async () => {
      const events = [nodeCreated(RUN, 1, 'a', 'A'), nodeCreated(RUN, 2, 'b', 'B')];
      await store.append(events);
      await store.append(events);
      // A re-delivered seq with different content must not overwrite the first write.
      await store.append([nodeCreated(RUN, 1, 'a', 'OVERWRITE ATTEMPT')]);
      const stored = await collect(store.readEvents(RUN));
      expect(stored.map((event) => event.seq)).toEqual([1, 2]);
      expect(stored[0]?.type === 'node_created' && stored[0].node.label).toBe('A');
    });

    it('reads events in seq order regardless of append order', async () => {
      await store.append([nodeCreated(RUN, 3, 'c', 'C')]);
      await store.append([nodeCreated(RUN, 1, 'a', 'A')]);
      await store.append([nodeCreated(RUN, 2, 'b', 'B')]);
      const stored = await collect(store.readEvents(RUN));
      expect(stored.map((event) => event.seq)).toEqual([1, 2, 3]);
    });

    it('filters reads by sinceSeq (exclusive)', async () => {
      await store.append([
        nodeCreated(RUN, 1, 'a', 'A'),
        nodeCreated(RUN, 2, 'b', 'B'),
        nodeCreated(RUN, 3, 'c', 'C'),
      ]);
      const stored = await collect(store.readEvents(RUN, 1));
      expect(stored.map((event) => event.seq)).toEqual([2, 3]);
    });

    it('isolates events by runId', async () => {
      await store.append([nodeCreated(RUN, 1, 'a', 'A')]);
      await store.append([nodeCreated(OTHER, 1, 'z', 'Z')]);
      const here = await collect(store.readEvents(RUN));
      expect(here.map((event) => event.id)).toEqual([`${RUN}-e1`]);
      const otherState = await store.snapshot(OTHER);
      expect(otherState.nodes.has('z')).toBe(true);
      expect(otherState.nodes.has('a')).toBe(false);
    });

    it('keeps snapshot consistent with a fold over readEvents', async () => {
      const events = [
        nodeCreated(RUN, 1, 'a', 'A'),
        nodeCreated(RUN, 2, 'b', 'B'),
        nodeCreated(RUN, 3, 'c', 'C'),
      ];
      await store.append(events);
      const replayed = await collect(store.readEvents(RUN));
      expect(canonicalize(await store.snapshot(RUN))).toBe(canonicalize(reduceAll(RUN, replayed)));
    });
  });
}
