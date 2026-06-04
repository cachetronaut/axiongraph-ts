import { defineConfig } from 'vitest/config';

// convex-test runs the component functions in-memory; it needs the edge-runtime environment
// and convex-test inlined so its module graph resolves against this workspace.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
  },
});
