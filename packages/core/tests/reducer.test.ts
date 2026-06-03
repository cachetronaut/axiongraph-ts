import { describe, expect, it } from 'vitest';
import { canonicalize } from '../src/canonical';
import { type Anomaly, emptyState, reduce, reduceAll } from '../src/reducer';
import type { GraphEvent } from '../src/types';
import { exampleVocabulary, validate } from '../src/vocabulary';

const RUN = 'run_1';

function nodeCreated(seq: number, id: string, label: string): GraphEvent {
  return {
    id: `e${seq}`,
    runId: RUN,
    seq,
    ts: '2026-06-03T00:00:00.000Z',
    type: 'node_created',
    node: { id, kind: 'agent', label },
  };
}

describe('reduce', () => {
  it('creates then shallow-merges a node update (D6)', () => {
    const events: GraphEvent[] = [
      nodeCreated(1, 'a', 'Researcher'),
      {
        id: 'e2',
        runId: RUN,
        seq: 2,
        ts: '2026-06-03T00:00:01.000Z',
        type: 'node_updated',
        node: { id: 'a', label: 'Research Agent' },
      },
    ];
    const state = reduceAll(RUN, events);
    expect(state.nodes.get('a')).toEqual({ id: 'a', kind: 'agent', label: 'Research Agent' });
    expect(state.seq).toBe(2);
  });

  it('is idempotent on a duplicate seq (D3)', () => {
    const event = nodeCreated(1, 'a', 'A');
    const once = reduce(emptyState(RUN), event);
    const twice = reduce(once, event);
    expect(canonicalize(twice)).toBe(canonicalize(once));
  });

  it('ignores a stale seq and reports it (D3)', () => {
    const anomalies: Anomaly[] = [];
    let state = reduce(emptyState(RUN), nodeCreated(2, 'a', 'A'));
    state = reduce(state, nodeCreated(1, 'b', 'B'), { onAnomaly: (a) => anomalies.push(a) });
    expect(state.nodes.has('b')).toBe(false);
    expect(anomalies[0]?.kind).toBe('stale_seq');
  });

  it('drops an update to an unknown node, advances seq, and reports it (D6)', () => {
    const anomalies: Anomaly[] = [];
    const state = reduce(
      emptyState(RUN),
      {
        id: 'e1',
        runId: RUN,
        seq: 1,
        ts: '2026-06-03T00:00:00.000Z',
        type: 'node_updated',
        node: { id: 'ghost', label: 'x' },
      },
      { onAnomaly: (a) => anomalies.push(a) },
    );
    expect(state.nodes.size).toBe(0);
    expect(state.seq).toBe(1);
    expect(anomalies[0]?.kind).toBe('update_unknown_node');
  });

  it('is order-independent in reduceAll (D3)', () => {
    const a = nodeCreated(1, 'a', 'A');
    const b = nodeCreated(2, 'b', 'B');
    const c = nodeCreated(3, 'c', 'C');
    expect(canonicalize(reduceAll(RUN, [c, a, b]))).toBe(canonicalize(reduceAll(RUN, [a, b, c])));
  });
});

describe('validate', () => {
  it('accepts a known kind and rejects an unknown one (D2)', () => {
    expect(validate(nodeCreated(1, 'a', 'A'), exampleVocabulary).ok).toBe(true);
    const bad: GraphEvent = {
      id: 'e1',
      runId: RUN,
      seq: 1,
      ts: '2026-06-03T00:00:00.000Z',
      type: 'node_created',
      node: { id: 'a', kind: 'wizard', label: 'A' },
    };
    expect(validate(bad, exampleVocabulary).ok).toBe(false);
  });
});
