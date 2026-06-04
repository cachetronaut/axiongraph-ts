import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// One append-only event log. `payload` is the whole `GraphEvent` (the event model is the
// source of truth); `runId`/`seq` are projected out for the `(runId, seq)` index that drives
// idempotent appends and seq-ordered range reads.
export default defineSchema({
  events: defineTable({
    runId: v.string(),
    seq: v.number(),
    payload: v.any(),
  }).index('by_run_seq', ['runId', 'seq']),
});
