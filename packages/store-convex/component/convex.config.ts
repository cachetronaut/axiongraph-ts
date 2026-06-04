import { defineComponent } from 'convex/server';

// The axiongraph event log as a Convex Component. A consuming app installs it in its
// `convex.config.ts` with `app.use(axiongraph)`; its tables/functions are then namespaced
// under `components.axiongraph`. (Convex Components are a beta feature.)
export default defineComponent('axiongraph');
