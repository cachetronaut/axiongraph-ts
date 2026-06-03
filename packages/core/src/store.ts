import type { GraphEvent, GraphState } from './types';

/**
 * The seam between the event model and any backend (spec D4). Core defines the port;
 * adapters (`@axiongraph/store-local`, and later convex/neo4j/postgres) implement it.
 *
 * Writes are append-only. `append` is idempotent on `(runId, seq)` so retried emitters
 * and at-least-once delivery never corrupt the log (ties back to spec D3).
 */
export interface GraphStore {
  /** Append events. Idempotent on `(runId, seq)`: re-appending a known seq is a no-op. */
  append(events: readonly GraphEvent[]): Promise<void>;
  /** Read a run's events in `seq` order, optionally only those after `sinceSeq` (exclusive). */
  readEvents(runId: string, sinceSeq?: number): AsyncIterable<GraphEvent>;
  /** The reduced state for a run. May be a live fold or a materialized cache. */
  snapshot(runId: string): Promise<GraphState>;
  /**
   * Optional realtime tail. Realtime fan-out is where the hosted product lives (spec D4);
   * the local adapter may omit it or poll. Core never assumes a realtime transport.
   */
  subscribe?(runId: string, sinceSeq?: number): AsyncIterable<GraphEvent>;
}
