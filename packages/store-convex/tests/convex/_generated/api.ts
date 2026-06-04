// Marker only. `convex-test` locates a module tree's root by finding a `_generated` path in the
// glob; it never imports this file (no function reference resolves here). Keeps us from running
// real `convex codegen` just to exercise the adapter offline.
export {};
