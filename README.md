# AxionGraph

<p align="center">
  <img src="https://raw.githubusercontent.com/cachetronaut/axiongraph-ts/main/docs/assets/axiongraph.png" alt="AxionGraph logo" height="500px" />
</p>

> Invisible events. Replayable graphs.

AxionGraph is an append-only event model and deterministic reducer for execution graphs.
It records graph events from agents, tools, workflows, and connectors, then folds them into
portable graph state for storage, replay, testing, and visualization.

Storage is a port. Rendering is a consumer concern. The core knows nothing about Convex,
Neo4j, realtime transports, auth, policy, or budgets — it is a small, byte-stable,
parity-testable primitive that ships as MIT OSS.

```ts
import { reduceAll } from "axiongraph";

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

## One package, opt-in extras

AxionGraph ships as a single `axiongraph` package with subpath entry points — the npm
equivalent of Python extras. Heavy backends are declared as optional peer dependencies, so
you install only what a feature needs.

| Entry point | Description | Extra to install |
| --- | --- | --- |
| `axiongraph` | Event model, deterministic reducer, canonicalizer, vocabulary machinery, and the `GraphStore` port. | — |
| `axiongraph/store-local` | Zero-service reference adapters: an in-memory store and a `node:sqlite`-backed durable store. | — (`node:sqlite` is built in) |
| `axiongraph/store-postgres` | Durable `PostgresStore` backed by a `pg` pool: `jsonb` event log keyed on `(runId, seq)`, idempotent appends, live-fold snapshots. | `pg` |

Planned subpaths: `axiongraph/store-convex` (peer: `convex`), `axiongraph/store-neo4j`
(peer: `neo4j-driver`). A Python mirror ships the same adapters as PyPI extras.

## Install

```sh
pnpm add axiongraph
# later, opting into a backend extra, e.g.:
# pnpm add axiongraph convex
```

## Storing and replaying events

```ts
import { SqliteStore } from "axiongraph/store-local";

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
pnpm build    # bundle the internal packages into the single axiongraph dist
```

The repo is an internal pnpm workspace (`packages/core`, `packages/store-local`,
`packages/store-postgres`, plus a dev-only `packages/testkit` shared contract suite); `tsup`
bundles the publishable ones into the single `axiongraph` dist with subpath exports.

The Postgres contract suite is gated on `AXIONGRAPH_TEST_POSTGRES_URL`; it is skipped locally
unless set, and CI runs it against a `postgres:16` service.

## Status

Early development. The TypeScript core and reference stores are implemented and parity-tested;
the Python mirror follows.

## License

MIT
