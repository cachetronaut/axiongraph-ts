import { defineConfig } from 'tsup';

// Single published `axiongraph` package built from the internal workspace packages.
// Each entry becomes a subpath export; `splitting` shares the core chunk between them so
// `@axiongraph/core` is bundled once. esbuild resolves the cross-package import via the
// workspace symlink; node builtins (node:sqlite, node:module) stay external.
export default defineConfig({
  entry: {
    index: 'packages/core/src/index.ts',
    'store-local': 'packages/store-local/src/index.ts',
  },
  format: 'esm',
  dts: true,
  splitting: true,
  clean: true,
  outDir: 'dist',
  target: 'es2022',
});
