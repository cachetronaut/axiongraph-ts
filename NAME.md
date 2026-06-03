# Name

**AxionGraph**

> Invisible events. Replayable graphs.

The working name during design was `graph-events`. The chosen, public-facing name is
**AxionGraph**, published as a single **unscoped** `axiongraph` npm package (no org/scope).

## Package and entry points

One published package, `axiongraph`, with subpath exports — the PyPI-extras model. Optional
backends are declared as optional peer dependencies (install only what a feature needs).

- `axiongraph` — event model, deterministic reducer, canonicalizer, vocabulary machinery,
  and the `GraphStore` port.
- `axiongraph/store-local` — zero-service reference adapters (`InMemoryStore`, `SqliteStore`).

Internally the repo is a pnpm workspace of `private` packages (`@axiongraph/core`,
`@axiongraph/store-local`) bundled by `tsup` into the one published package.

Planned subpaths: `axiongraph/store-convex` (peer: `convex`), `axiongraph/store-neo4j`
(peer: `neo4j-driver`); and `axiongraph` on PyPI (Python mirror).

## Notes

- Repository directory is `axiongraph-ts/` (the `-ts` suffix distinguishes it from the
  Python mirror `axiongraph-py`); renamed from the spec's working name `graph-events-ts`.
- This file is the source of truth for the name, per the spec's naming convention.
