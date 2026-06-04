import { type GraphEvent, type GraphState, type GraphStore, reduceAll } from '@axiongraph/core';
import {
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  makeFunctionReference,
} from 'convex/server';

/**
 * The one-shot surface this adapter needs: run a mutation or query by reference. Declared
 * structurally so it is satisfied by `ConvexHttpClient`, the WebSocket `ConvexClient`, and the
 * `convex-test` harness alike — the store never imports a concrete client.
 */
export interface ConvexClientLike {
  mutation<Mutation extends FunctionReference<'mutation'>>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ): Promise<FunctionReturnType<Mutation>>;
  query<Query extends FunctionReference<'query'>>(
    query: Query,
    args: FunctionArgs<Query>,
  ): Promise<FunctionReturnType<Query>>;
}

/**
 * The reactive surface needed for {@link ConvexStore.subscribe}: register a callback that refires
 * whenever a query's result changes. Satisfied by the WebSocket `ConvexClient.onUpdate`.
 */
export interface ConvexReactiveClientLike {
  onUpdate<Query extends FunctionReference<'query'>>(
    query: Query,
    args: FunctionArgs<Query>,
    callback: (result: FunctionReturnType<Query>) => unknown,
    onError?: (error: Error) => unknown,
  ): () => void;
}

export interface ConvexStoreOptions {
  /**
   * Name of the host file that re-exports {@link exposeAxiongraph}'s functions, used to build the
   * `${prefix}:append` / `${prefix}:readEvents` references. Default `axiongraph` — i.e. the host
   * wrote `convex/axiongraph.ts`. Override if the exports live in a differently named file.
   */
  readonly prefix?: string;
  /**
   * A reactive client for {@link ConvexStore.subscribe}. Defaults to the primary client when it
   * exposes `onUpdate`; pass one explicitly when reads go over HTTP but the tail needs a socket.
   */
  readonly reactive?: ConvexReactiveClientLike;
}

/**
 * An external {@link GraphStore} client for a Convex deployment running the axiongraph component
 * (spec D4). It does not touch the database directly: it calls the public `append`/`readEvents`
 * functions the host exposed via {@link exposeAxiongraph}, which delegate into `components.axiongraph`.
 *
 * `convex` is an optional peer dependency — install it alongside `axiongraph` to use this adapter.
 * `subscribe` is the realtime seam (spec D4): it bridges the reactive `readEvents` query into an
 * `AsyncIterable`, available only when constructed with a reactive client.
 */
export class ConvexStore implements GraphStore {
  private readonly client: ConvexClientLike;
  private readonly reactive?: ConvexReactiveClientLike;
  private readonly appendRef: FunctionReference<
    'mutation',
    'public',
    { events: GraphEvent[] },
    null
  >;
  private readonly readEventsRef: FunctionReference<
    'query',
    'public',
    { runId: string; sinceSeq?: number },
    GraphEvent[]
  >;

  constructor(client: ConvexClientLike, options: ConvexStoreOptions = {}) {
    this.client = client;
    this.reactive =
      options.reactive ??
      ('onUpdate' in client ? (client as unknown as ConvexReactiveClientLike) : undefined);
    const prefix = options.prefix ?? 'axiongraph';
    this.appendRef = makeFunctionReference<'mutation', { events: GraphEvent[] }, null>(
      `${prefix}:append`,
    );
    this.readEventsRef = makeFunctionReference<
      'query',
      { runId: string; sinceSeq?: number },
      GraphEvent[]
    >(`${prefix}:readEvents`);
  }

  async append(events: readonly GraphEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.client.mutation(this.appendRef, { events: events as GraphEvent[] });
  }

  async *readEvents(runId: string, sinceSeq?: number): AsyncIterable<GraphEvent> {
    const events = await this.client.query(this.readEventsRef, { runId, sinceSeq });
    for (const event of events) {
      yield event;
    }
  }

  async snapshot(runId: string): Promise<GraphState> {
    const events = await this.client.query(this.readEventsRef, { runId });
    return reduceAll(runId, events);
  }

  /**
   * A realtime tail backed by Convex reactivity. The `readEvents` query re-runs whenever the run's
   * log changes; each refire returns every event past `sinceSeq`, and a client-side high-water mark
   * yields each new event exactly once. Iterate it in a `for await`; breaking out unsubscribes.
   *
   * Only available when the store has a reactive client (see {@link ConvexStoreOptions.reactive}).
   */
  async *subscribe(runId: string, sinceSeq = 0): AsyncIterable<GraphEvent> {
    const reactive = this.reactive;
    if (!reactive) {
      throw new Error(
        'ConvexStore.subscribe requires a reactive client (e.g. ConvexClient); ' +
          'construct the store with one, or pass options.reactive.',
      );
    }

    let highWater = sinceSeq;
    const queue: GraphEvent[] = [];
    let wake: (() => void) | undefined;
    let failure: Error | undefined;

    const unsubscribe = reactive.onUpdate(
      this.readEventsRef,
      { runId, sinceSeq },
      (events) => {
        for (const event of events) {
          if (event.seq > highWater) {
            highWater = event.seq;
            queue.push(event);
          }
        }
        wake?.();
      },
      (error) => {
        failure = error;
        wake?.();
      },
    );

    try {
      while (true) {
        if (failure) {
          throw failure;
        }
        if (queue.length > 0) {
          yield queue.shift() as GraphEvent;
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      unsubscribe();
    }
  }
}
