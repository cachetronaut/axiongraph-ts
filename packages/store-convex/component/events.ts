import type {
  DataModelFromSchemaDefinition,
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from 'convex/server';
import { mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';
import type schema from './schema';

// Component-internal functions. Written with the generic builders so the component needs no
// codegen to typecheck/test; the host reaches them via `components.axiongraph.events.*`.
// We re-type the generic `ctx.db` against this component's own schema so the `by_run_seq`
// index range builder is field-aware (the generic builder collapses after one `.eq`).
type DataModel = DataModelFromSchemaDefinition<typeof schema>;

/** Append events, idempotent on `(runId, seq)` — a re-appended seq is skipped (spec D3). */
export const append = mutationGeneric({
  args: { events: v.array(v.any()) },
  handler: async (ctx, { events }) => {
    const db = ctx.db as GenericDatabaseWriter<DataModel>;
    for (const event of events as { runId: string; seq: number }[]) {
      const existing = await db
        .query('events')
        .withIndex('by_run_seq', (q) => q.eq('runId', event.runId).eq('seq', event.seq))
        .unique();
      if (existing !== null) continue;
      await db.insert('events', { runId: event.runId, seq: event.seq, payload: event });
    }
  },
});

/** Read a run's events in `seq` order, only those with `seq > sinceSeq` (exclusive). */
export const readEvents = queryGeneric({
  args: { runId: v.string(), sinceSeq: v.optional(v.number()) },
  handler: async (ctx, { runId, sinceSeq }) => {
    const db = ctx.db as GenericDatabaseReader<DataModel>;
    const lower = sinceSeq ?? 0;
    const rows = await db
      .query('events')
      .withIndex('by_run_seq', (q) => q.eq('runId', runId).gt('seq', lower))
      .collect();
    return rows.map((row) => row.payload);
  },
});
