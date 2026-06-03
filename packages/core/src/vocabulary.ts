import type { GraphEvent } from './types';

/**
 * A declared closed vocabulary (spec D2). Core ships the *machinery* and a neutral
 * example set; it never hard-codes a domain's vocabulary into the model.
 */
export interface GraphVocabulary {
  readonly nodeKinds: ReadonlySet<string>;
  readonly edgeKinds: ReadonlySet<string>;
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** Reject `*_created` events whose kind is outside the supplied vocabulary. */
export function validate(event: GraphEvent, vocab: GraphVocabulary): ValidationResult {
  if (event.type === 'node_created' && !vocab.nodeKinds.has(event.node.kind)) {
    return { ok: false, reason: `unknown node kind: ${event.node.kind}` };
  }
  if (event.type === 'edge_created' && !vocab.edgeKinds.has(event.edge.kind)) {
    return { ok: false, reason: `unknown edge kind: ${event.edge.kind}` };
  }
  return { ok: true };
}

/** A neutral example vocabulary for docs and tests. Reveals no product domain. */
export const exampleVocabulary: GraphVocabulary = {
  nodeKinds: new Set([
    'human',
    'agent',
    'task',
    'delegation',
    'connector',
    'tool',
    'artifact',
    'source',
    'approval',
    'policy_decision',
    'budget_check',
    'error',
    'model_call',
  ]),
  edgeKinds: new Set([
    'created_task',
    'delegated_to',
    'handoff_to',
    'called_tool',
    'called_connector',
    'used_model',
    'read_source',
    'created_artifact',
    'requested_approval',
    'approved_by',
    'denied_by',
    'blocked_by_policy',
    'blocked_by_budget',
    'derived_from',
    'cited_source',
    'failed_with',
  ]),
};
