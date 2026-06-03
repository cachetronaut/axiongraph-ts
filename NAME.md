# Name

**AxionGraph**

> Invisible events. Replayable graphs.

The working name during design was `graph-events`. The chosen, public-facing name is
**AxionGraph**, published under the `@axiongraph` npm scope.

## Packages

- `@axiongraph/core` — event model, deterministic reducer, canonicalizer, vocabulary
  machinery, and the `GraphStore` port.
- `@axiongraph/store-local` — zero-service reference adapters (`InMemoryStore`,
  `SqliteStore`).

Planned:

- `axiongraph` — Python mirror (PyPI, unscoped).
- `@axiongraph/store-convex`, `@axiongraph/store-neo4j`, `@axiongraph/store-postgres`.

## Notes

- Repository directory is `axiongraph-ts/` (the `-ts` suffix distinguishes it from the
  Python mirror `axiongraph-py`); renamed from the spec's working name `graph-events-ts`.
- This file is the source of truth for the name, per the spec's naming convention.
