# AxionGraph

> Invisible events. Replayable graphs.

AxionGraph is an append-only event model and deterministic reducer for execution graphs.
It records graph events from agents, tools, workflows, and connectors, then folds them into
portable graph state for storage, replay, testing, and visualization.

Storage is a port. Rendering is a consumer concern. The core knows nothing about Convex,
Neo4j, realtime transports, auth, policy, or budgets — it is a small, byte-stable,
parity-testable primitive that ships as MIT OSS.

```ts
import { reduceAll } from "@axiongraph/core";

const events = [
  { id: "evt_01", runId: "run_01", seq: 1, ts: "2026-06-02T12:00:00.000Z",
    type: "node_created", node: { id: "agent_research", kind: "agent", label: "Research Agent" } },
  { id: "evt_02", runId: "run_01", seq: 2, ts: "2026-06-02T12:00:01.000Z",
    type: "node_created", node: { id: "tool_web", kind: "tool", label: "Web Search" } },
  { id: "evt_03", runId: "run_01", seq: 3, ts: "2026-06-02T12:00:02.000Z",
    type: "edge_created", edge: { id: "edge_01", kind: "called_tool", from: "agent_research", to: "tool_web", status: "completed" } },
];

const state = reduceAll("run_01", events);
console.log(state.nodes.size); // 2
console.log(state.edges.size); // 1
```

## Why

Agent and workflow systems need a clean way to answer:

- What happened, and in what order?
- Which agents, tools, sources, and artifacts were involved?
- Can the run be replayed? Can the graph state be tested across runtimes?

AxionGraph keeps that layer small and portable.

## Core ideas

- Append-only events are the source of truth; graph state is derived by folding them.
- The reducer is pure and deterministic — identical event logs fold to byte-identical state.
- A monotonic `seq` per run defines order; wall-clock `ts` is advisory.
- Node/edge `kind` is an open taxonomy; supply a `GraphVocabulary` to reject unknown kinds.
- Storage is a port (`GraphStore`); rendering and realtime transport are consumer concerns.
- TypeScript first, with a Python mirror kept honest by shared parity fixtures.

## Packages

| Package | Description |
| --- | --- |
| [`@axiongraph/core`](packages/core) | Event model, deterministic reducer, canonicalizer, vocabulary machinery, and the `GraphStore` port. |
| [`@axiongraph/store-local`](packages/store-local) | Zero-service reference adapters: an in-memory store and a `node:sqlite`-backed durable store. |

Planned: `axiongraph` (Python, PyPI), `@axiongraph/store-convex`, `@axiongraph/store-neo4j`.

## Install

```sh
pnpm add @axiongraph/core
pnpm add @axiongraph/store-local   # optional: reference stores
```

## Storing and replaying events

```ts
import { SqliteStore } from "@axiongraph/store-local";

const store = new SqliteStore("./run.db"); // or new InMemoryStore()
await store.append(events);                // idempotent on (runId, seq)
const state = await store.snapshot("run_01");
```

Both `InMemoryStore` and `SqliteStore` satisfy the same `GraphStore` contract, so they are
interchangeable; any future adapter that passes the shared contract suite drops in the same way.

## Development

Node 24 and pnpm 9. The repo is a pnpm workspace.

```sh
pnpm install
pnpm verify   # biome check + tsc typecheck + Vitest
pnpm build    # emit dist/ for each publishable package
```

## Status

Early development. The TypeScript core and reference stores are implemented and parity-tested;
the Python mirror follows.

## License

MIT
