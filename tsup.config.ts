import { cpSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'tsup';

// Single published `axiongraph` package built from the internal workspace packages.
// Each entry becomes a subpath export; `splitting` shares the core chunk between them so
// `@axiongraph/core` is bundled once. esbuild resolves the cross-package import via the
// workspace symlink; node builtins (node:sqlite, node:module) stay external.
export default defineConfig({
  entry: {
    index: 'packages/core/src/index.ts',
    'store-local': 'packages/store-local/src/index.ts',
    'store-postgres': 'packages/store-postgres/src/index.ts',
    'store-convex': 'packages/store-convex/src/index.ts',
    'store-convex/server': 'packages/store-convex/src/server.ts',
  },
  format: 'esm',
  dts: true,
  splitting: true,
  clean: true,
  outDir: 'dist',
  target: 'es2022',
  // The Convex component isn't bundled — Convex compiles it on the consumer's `convex dev`/deploy.
  // Ship its raw source next to the built client/server so `axiongraph/store-convex/convex.config`
  // resolves to a directory Convex can scan for the component's schema + functions.
  onSuccess: async () => {
    mkdirSync('dist/store-convex/component', { recursive: true });
    cpSync('packages/store-convex/component', 'dist/store-convex/component', { recursive: true });
  },
});
