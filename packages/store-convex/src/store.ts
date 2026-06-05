import { type GraphEvent, type GraphState, type GraphStore, reduceAll } from '@axiongraph/core';
import {
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  makeFunctionReference,
} from 'convex/server';
import type {
  Row,
  ScanOptions,
  StoreDriver,
  Transaction,
} from '../../../../dockbay-ts/packages/core/src/index';

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
  private readonly driver: ConvexGraphDriver;
  private readonly reactive?: ConvexReactiveClientLike;
  private readonly readEventsRef: FunctionReference<
    'query',
    'public',
    { runId: string; sinceSeq?: number },
    GraphEvent[]
  >;

  constructor(client: ConvexClientLike, options: ConvexStoreOptions = {}) {
    this.reactive =
      options.reactive ??
      ('onUpdate' in client ? (client as unknown as ConvexReactiveClientLike) : undefined);
    const prefix = options.prefix ?? 'axiongraph';
    const appendRef = makeFunctionReference<'mutation', { events: GraphEvent[] }, null>(
      `${prefix}:append`,
    );
    this.readEventsRef = makeFunctionReference<
      'query',
      { runId: string; sinceSeq?: number },
      GraphEvent[]
    >(`${prefix}:readEvents`);
    this.driver = new ConvexGraphDriver(client, appendRef, this.readEventsRef);
  }

  async append(events: readonly GraphEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.driver.transaction(async (txn) => {
      for (const event of events) {
        await txn.upsert('events', eventKey(event), { payload: event });
      }
    });
  }

  async *readEvents(runId: string, sinceSeq?: number): AsyncIterable<GraphEvent> {
    yield* await this.driver.transaction(async (txn) => {
      const events: GraphEvent[] = [];
      for await (const row of txn.scan(
        'events',
        { runId },
        { after: { runId, seq: sinceSeq ?? 0 } },
      )) {
        events.push(row.payload as GraphEvent);
      }
      return events;
    });
  }

  async snapshot(runId: string): Promise<GraphState> {
    const events: GraphEvent[] = [];
    for await (const event of this.readEvents(runId)) {
      events.push(event);
    }
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

class ConvexGraphDriver implements StoreDriver {
  readonly backend = 'convex';

  constructor(
    private readonly client: ConvexClientLike,
    private readonly appendRef: FunctionReference<
      'mutation',
      'public',
      { events: GraphEvent[] },
      null
    >,
    private readonly readEventsRef: FunctionReference<
      'query',
      'public',
      { runId: string; sinceSeq?: number },
      GraphEvent[]
    >,
  ) {}

  async transaction<T>(work: (txn: Transaction) => Promise<T>): Promise<T> {
    return work(new ConvexGraphTransaction(this.client, this.appendRef, this.readEventsRef));
  }

  async close(): Promise<void> {}
}

class ConvexGraphTransaction implements Transaction {
  constructor(
    private readonly client: ConvexClientLike,
    private readonly appendRef: FunctionReference<
      'mutation',
      'public',
      { events: GraphEvent[] },
      null
    >,
    private readonly readEventsRef: FunctionReference<
      'query',
      'public',
      { runId: string; sinceSeq?: number },
      GraphEvent[]
    >,
  ) {}

  async upsert(table: string, _key: Row, row: Row): Promise<void> {
    this.assertEventTable(table);
    await this.client.mutation(this.appendRef, { events: [row.payload as GraphEvent] });
  }

  async get(table: string, key: Row): Promise<Row | undefined> {
    this.assertEventTable(table);
    const events = await this.client.query(this.readEventsRef, {
      runId: key.runId as string,
      sinceSeq: ((key.seq as number) ?? 1) - 1,
    });
    const event = events.find((candidate) => candidate.seq === key.seq);
    return event === undefined ? undefined : { payload: event };
  }

  async *scan(table: string, prefix: Row, opts: ScanOptions = {}): AsyncIterable<Row> {
    this.assertEventTable(table);
    const afterSeq = typeof opts.after?.seq === 'number' ? opts.after.seq : undefined;
    const events = await this.client.query(this.readEventsRef, {
      runId: prefix.runId as string,
      sinceSeq: afterSeq,
    });
    const limited = opts.limit === undefined ? events : events.slice(0, opts.limit);
    for (const event of limited) {
      yield { payload: event };
    }
  }

  async compareAndApply(): Promise<boolean> {
    throw new Error('ConvexGraphTransaction.compareAndApply is not supported by GraphStore');
  }

  private assertEventTable(table: string): void {
    if (table !== 'events') {
      throw new Error(`Unknown Convex graph table: ${table}`);
    }
  }
}

function eventKey(event: GraphEvent): Row {
  return { runId: event.runId, seq: event.seq };
}
