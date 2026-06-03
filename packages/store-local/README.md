# @axiongraph/store-local

Zero-service reference `GraphStore` adapters for
[AxionGraph](https://github.com/cachetronaut/axiongraph-ts):

- `InMemoryStore` — a `Map`-backed store for tests and ephemeral runs.
- `SqliteStore` — a durable single-file store backed by Node's built-in `node:sqlite`.

```ts
import { InMemoryStore, SqliteStore } from "@axiongraph/store-local";

const store = new SqliteStore("./run.db"); // or new InMemoryStore()
await store.append(events);                // idempotent on (runId, seq)
const state = await store.snapshot("run_01");
```

Both satisfy the same `GraphStore` contract and are interchangeable. Requires
`@axiongraph/core`. See the
[repository README](https://github.com/cachetronaut/axiongraph-ts#readme). MIT licensed.
