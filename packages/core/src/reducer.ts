import type { EdgePayload, GraphEvent, GraphState, NodePayload } from './types';

/** Things the reducer noticed but did not apply. Observation only — never thrown (spec D6). */
export type AnomalyKind = 'wrong_run' | 'stale_seq' | 'update_unknown_node' | 'update_unknown_edge';

export interface Anomaly {
  readonly kind: AnomalyKind;
  readonly event: GraphEvent;
}

export interface ReduceOptions {
  readonly onAnomaly?: (anomaly: Anomaly) => void;
}

/** The fold's seed. `seq` starts at 0; the first applied event must have `seq >= 1`. */
export function emptyState(runId: string): GraphState {
  return { runId, nodes: new Map(), edges: new Map(), seq: 0 };
}

/**
 * Apply one event. Pure and deterministic (spec D5): no clock, no I/O. Events for a
 * different run, or with a non-increasing `seq`, are ignored idempotently (spec D3).
 */
export function reduce(
  state: GraphState,
  event: GraphEvent,
  options: ReduceOptions = {},
): GraphState {
  const report = options.onAnomaly;

  if (event.runId !== state.runId) {
    report?.({ kind: 'wrong_run', event });
    return state;
  }
  if (event.seq <= state.seq) {
    report?.({ kind: 'stale_seq', event });
    return state;
  }

  switch (event.type) {
    case 'node_created': {
      const nodes = new Map(state.nodes);
      nodes.set(event.node.id, event.node);
      return { runId: state.runId, nodes, edges: state.edges, seq: event.seq };
    }
    case 'node_updated': {
      const existing = state.nodes.get(event.node.id);
      if (existing === undefined) {
        report?.({ kind: 'update_unknown_node', event });
        return { ...state, seq: event.seq };
      }
      const merged: NodePayload = { ...existing, ...event.node };
      const nodes = new Map(state.nodes);
      nodes.set(merged.id, merged);
      return { runId: state.runId, nodes, edges: state.edges, seq: event.seq };
    }
    case 'edge_created': {
      const edges = new Map(state.edges);
      edges.set(event.edge.id, event.edge);
      return { runId: state.runId, nodes: state.nodes, edges, seq: event.seq };
    }
    case 'edge_updated': {
      const existing = state.edges.get(event.edge.id);
      if (existing === undefined) {
        report?.({ kind: 'update_unknown_edge', event });
        return { ...state, seq: event.seq };
      }
      const merged: EdgePayload = { ...existing, ...event.edge };
      const edges = new Map(state.edges);
      edges.set(merged.id, merged);
      return { runId: state.runId, nodes: state.nodes, edges, seq: event.seq };
    }
  }
}

/** Fold an event log into state. Sorts by `seq` first, so arrival order does not matter. */
export function reduceAll(
  runId: string,
  events: Iterable<GraphEvent>,
  options: ReduceOptions = {},
): GraphState {
  const sorted = [...events].sort((left, right) => left.seq - right.seq);
  let state = emptyState(runId);
  for (const event of sorted) {
    state = reduce(state, event, options);
  }
  return state;
}

/** Derive a filtered view: keep matching nodes and any edge whose endpoints both survive. */
export function subgraph(state: GraphState, keepNode: (node: NodePayload) => boolean): GraphState {
  const nodes = new Map<string, NodePayload>();
  for (const [id, node] of state.nodes) {
    if (keepNode(node)) {
      nodes.set(id, node);
    }
  }
  const edges = new Map<string, EdgePayload>();
  for (const [id, edge] of state.edges) {
    if (nodes.has(edge.from) && nodes.has(edge.to)) {
      edges.set(id, edge);
    }
  }
  return { runId: state.runId, nodes, edges, seq: state.seq };
}
