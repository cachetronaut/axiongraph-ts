/**
 * The append-only event model. The event log is the source of truth (spec D1);
 * live {@link GraphState} is always a fold over events, never mutated in place.
 */

export type GraphEventType = 'node_created' | 'node_updated' | 'edge_created' | 'edge_updated';

export type EdgeStatus = 'proposed' | 'active' | 'completed' | 'failed' | 'blocked';

export interface NodePayload {
  readonly id: string;
  /** Open taxonomy (spec D2): a plain string, optionally checked against a vocabulary. */
  readonly kind: string;
  readonly label: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EdgePayload {
  readonly id: string;
  readonly kind: string;
  readonly from: string;
  readonly to: string;
  readonly status: EdgeStatus;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** An update carries a partial payload; the reducer shallow-merges it (spec D6). */
export type NodeUpdate = { readonly id: string } & Partial<Omit<NodePayload, 'id'>>;
export type EdgeUpdate = { readonly id: string } & Partial<Omit<EdgePayload, 'id'>>;

interface GraphEventBase {
  readonly id: string;
  readonly runId: string;
  /** Monotonic per runId; defines replay order (spec D3). `ts` is advisory only. */
  readonly seq: number;
  readonly ts: string;
  readonly actor?: string;
}

export type GraphEvent =
  | (GraphEventBase & { readonly type: 'node_created'; readonly node: NodePayload })
  | (GraphEventBase & { readonly type: 'node_updated'; readonly node: NodeUpdate })
  | (GraphEventBase & { readonly type: 'edge_created'; readonly edge: EdgePayload })
  | (GraphEventBase & { readonly type: 'edge_updated'; readonly edge: EdgeUpdate });

/** The reduced live state: two id-keyed maps plus the last applied sequence. */
export interface GraphState {
  readonly runId: string;
  readonly nodes: ReadonlyMap<string, NodePayload>;
  readonly edges: ReadonlyMap<string, EdgePayload>;
  readonly seq: number;
}
