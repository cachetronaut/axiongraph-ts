/**
 * Host-side glue. A Convex Component's functions aren't directly reachable by an external
 * client; the host app must expose public functions that delegate to it. `exposeAxiongraph`
 * builds that public surface so the user only writes a one-liner in their `convex/`:
 *
 * ```ts
 * import { components } from "./_generated/api";
 * import { exposeAxiongraph } from "axiongraph/store-convex/server";
 * export const { append, readEvents } = exposeAxiongraph(components.axiongraph);
 * ```
 *
 * The exposed `append`/`readEvents` are what {@link ConvexStore} (and its `subscribe` tail)
 * call by name. (Convex Components are a beta feature.)
 */

import type { GraphEvent } from '@axiongraph/core';
import { type FunctionReference, mutationGeneric, queryGeneric } from 'convex/server';
import { v } from 'convex/values';

/** The slice of `components.axiongraph` this adapter drives. */
export interface AxiongraphComponent {
  events: {
    append: FunctionReference<'mutation', 'internal', { events: GraphEvent[] }, null>;
    readEvents: FunctionReference<
      'query',
      'internal',
      { runId: string; sinceSeq?: number },
      GraphEvent[]
    >;
  };
}

/** Build the public `append`/`readEvents` functions that delegate to the installed component. */
export function exposeAxiongraph(component: AxiongraphComponent) {
  const append = mutationGeneric({
    args: { events: v.array(v.any()) },
    handler: async (ctx, args): Promise<null> => {
      await ctx.runMutation(component.events.append, { events: args.events as GraphEvent[] });
      return null;
    },
  });

  const readEvents = queryGeneric({
    args: { runId: v.string(), sinceSeq: v.optional(v.number()) },
    handler: (ctx, args): Promise<GraphEvent[]> => ctx.runQuery(component.events.readEvents, args),
  });

  return { append, readEvents };
}
