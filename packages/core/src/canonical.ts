import type { GraphState } from './types';

function compareString(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** Recursively sort object keys so serialization is order-independent. */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const sorted = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareString(left, right))
      .map(([key, val]) => [key, sortValue(val)] as const);
    return Object.fromEntries(sorted);
  }
  return value;
}

/**
 * Deterministic, key-sorted JSON for a state. Identical event logs fold to byte-identical
 * output (spec D5) — this is the contract the cross-language parity fixtures pin.
 */
export function canonicalize(state: GraphState): string {
  const nodes = [...state.nodes.values()].sort((left, right) => compareString(left.id, right.id));
  const edges = [...state.edges.values()].sort((left, right) => compareString(left.id, right.id));
  const shape = {
    runId: state.runId,
    seq: state.seq,
    nodes: nodes.map(sortValue),
    edges: edges.map(sortValue),
  };
  return JSON.stringify(sortValue(shape));
}
