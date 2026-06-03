# @axiongraph/core

Core contracts for [AxionGraph](https://github.com/cachetronaut/axiongraph-ts): the
append-only graph event model, the deterministic reducer (`reduce` / `reduceAll`), the
canonicalizer, the vocabulary machinery, and the `GraphStore` port.

```ts
import { reduceAll, canonicalize } from "@axiongraph/core";

const state = reduceAll("run_01", events);
const snapshot = canonicalize(state); // deterministic, key-sorted JSON
```

See the [repository README](https://github.com/cachetronaut/axiongraph-ts#readme) for the
full picture. MIT licensed.
