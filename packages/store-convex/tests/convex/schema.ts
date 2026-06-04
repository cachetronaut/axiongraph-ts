import { defineSchema } from 'convex/server';

// The host app under test owns no tables of its own; all storage lives in the mounted
// axiongraph component. An empty schema is enough for `convex-test` to stand up the host.
export default defineSchema({});
