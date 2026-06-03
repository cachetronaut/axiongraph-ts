import { type GraphEvent, type GraphState, type GraphStore, reduceAll } from '@axiongraph/core';

/**
 * A `Map`-backed {@link GraphStore} for tests and ephemeral runs. Append-only and
 * idempotent on `(runId, seq)` (spec D4). No durability; everything lives in process memory.
 */
export class InMemoryStore implements GraphStore {
  /** Per-run logs, each kept sorted by `seq` with at most one event per `seq`. */
  private readonly logs = new Map<string, GraphEvent[]>();

  async append(events: readonly GraphEvent[]): Promise<void> {
    for (const event of events) {
      const log = this.logs.get(event.runId) ?? [];
      if (log.some((existing) => existing.seq === event.seq)) {
        continue; // idempotent on (runId, seq)
      }
      log.push(event);
      log.sort((left, right) => left.seq - right.seq);
      this.logs.set(event.runId, log);
    }
  }

  async *readEvents(runId: string, sinceSeq = 0): AsyncIterable<GraphEvent> {
    const log = this.logs.get(runId) ?? [];
    for (const event of log) {
      if (event.seq > sinceSeq) {
        yield event;
      }
    }
  }

  async snapshot(runId: string): Promise<GraphState> {
    return reduceAll(runId, this.logs.get(runId) ?? []);
  }
}
