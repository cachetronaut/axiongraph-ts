// Re-export the real component functions so `convex-test`'s registered component resolves
// `events:append` / `events:readEvents` to the shipped implementation, while the module-tree
// root stays test-local (next to the `_generated` marker).
export { append, readEvents } from '../../component/events';
