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
| `axiongraph/store-convex` | `ConvexStore` for a [Convex](https://convex.dev) deployment, shipped as a Convex Component. Includes a minimal reactive `subscribe()` over `client.onUpdate` — the port's optional realtime tail. | `convex` |

Planned subpaths: `axiongraph/store-neo4j` (peer: `neo4j-driver`). A Python mirror ships the
same adapters as PyPI extras.

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

### Convex

The Convex adapter ships as a [Convex Component](https://docs.convex.dev/components). Install it
in your `convex/convex.config.ts`, then expose its functions with the provided host factory:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import axiongraph from "axiongraph/store-convex/convex.config";

const app = defineApp();
app.use(axiongraph);
export default app;

// convex/axiongraph.ts
import { components } from "./_generated/api";
import { exposeAxiongraph } from "axiongraph/store-convex/server";

export const { append, readEvents } = exposeAxiongraph(components.axiongraph);
```

An external client then drives it like any other `GraphStore`:

```ts
import { ConvexClient } from "convex/browser";
import { ConvexStore } from "axiongraph/store-convex";

const store = new ConvexStore(new ConvexClient(process.env.CONVEX_URL!));
await store.append(events);
for await (const event of store.subscribe!("run_01")) {
  // reactive tail — re-fires as the run's log grows
}
```

Convex Components are a beta feature; the component is bundled by your own `convex dev`/deploy.

## Development

Node 24 and pnpm 9. The repo is a pnpm workspace.

```sh
pnpm install
pnpm verify   # biome check + tsc typecheck + Vitest
pnpm build    # bundle the internal packages into the single axiongraph dist
```

The repo is an internal pnpm workspace (`packages/core`, `packages/store-local`,
`packages/store-postgres`, `packages/store-convex`, plus a dev-only `packages/testkit` shared
contract suite); `tsup` bundles the publishable ones into the single `axiongraph` dist with
subpath exports, and copies the Convex component source in unbundled (Convex compiles it).

The Postgres contract suite is gated on `AXIONGRAPH_TEST_POSTGRES_URL`; it is skipped locally
unless set, and CI runs it against a `postgres:16` service. The Convex adapter runs its store
contract offline via `convex-test`; a live smoke test is gated on `CONVEX_URL`.

## Status

Early development. The TypeScript core and reference stores are implemented and parity-tested;
the Python mirror follows.

## License

MIT
