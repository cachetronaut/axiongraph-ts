import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '../src/canonical';
import { reduceAll, subgraph } from '../src/reducer';
import type { EdgePayload, GraphEvent, GraphState, NodePayload } from '../src/types';
import { type GraphVocabulary, validate } from '../src/vocabulary';

/**
 * The cross-language parity suite. Each case under `parity/<case>/` is a language-neutral
 * fixture both the TypeScript and Python cores must satisfy (spec §"Cross-language parity").
 *
 * `events.json` is the input log. The default operation folds it and compares the canonical
 * state to `state.json`. An optional `manifest.json` selects a different operation:
 *   - `{ "op": "subgraph", "keepNodeKinds": [...] }` — fold, then filter, compare to state.json.
 *   - `{ "op": "validate", "vocab": {...}, "rejected": [...] }` — the event ids a vocabulary rejects.
 */

const PARITY_DIR = join(dirname(fileURLToPath(import.meta.url)), 'parity');

interface SerializedState {
  readonly runId: string;
  readonly seq: number;
  readonly nodes: readonly NodePayload[];
  readonly edges: readonly EdgePayload[];
}

interface Manifest {
  readonly op?: 'reduce' | 'subgraph' | 'validate';
  readonly keepNodeKinds?: readonly string[];
  readonly vocab?: { readonly nodeKinds: readonly string[]; readonly edgeKinds: readonly string[] };
  readonly rejected?: readonly string[];
}

function readJson<T>(caseDir: string, file: string): T {
  return JSON.parse(readFileSync(join(PARITY_DIR, caseDir, file), 'utf8')) as T;
}

function readManifest(caseDir: string): Manifest {
  try {
    return readJson<Manifest>(caseDir, 'manifest.json');
  } catch {
    return {};
  }
}

/** Rebuild a {@link GraphState} from the serialized golden file so both sides go through canonicalize. */
function stateFromSerialized(serialized: SerializedState): GraphState {
  return {
    runId: serialized.runId,
    seq: serialized.seq,
    nodes: new Map(serialized.nodes.map((node) => [node.id, node])),
    edges: new Map(serialized.edges.map((edge) => [edge.id, edge])),
  };
}

const cases = readdirSync(PARITY_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('parity fixtures', () => {
  it('discovers at least the required cases', () => {
    expect(cases).toEqual(
      expect.arrayContaining([
        'create_then_update',
        'duplicate_seq',
        'out_of_order_seq',
        'subgraph_chain',
        'unknown_update_dropped',
        'vocabulary_rejection',
      ]),
    );
  });

  for (const caseDir of cases) {
    it(`matches the golden fixture: ${caseDir}`, () => {
      const events = readJson<GraphEvent[]>(caseDir, 'events.json');
      const runId = events[0]?.runId ?? '';
      const manifest = readManifest(caseDir);

      switch (manifest.op) {
        case 'validate': {
          const vocab: GraphVocabulary = {
            nodeKinds: new Set(manifest.vocab?.nodeKinds ?? []),
            edgeKinds: new Set(manifest.vocab?.edgeKinds ?? []),
          };
          const rejected = events
            .filter((event) => !validate(event, vocab).ok)
            .map((event) => event.id);
          expect(rejected).toEqual(manifest.rejected ?? []);
          return;
        }
        case 'subgraph': {
          const keep = new Set(manifest.keepNodeKinds ?? []);
          const folded = subgraph(reduceAll(runId, events), (node) => keep.has(node.kind));
          const expected = stateFromSerialized(readJson<SerializedState>(caseDir, 'state.json'));
          expect(canonicalize(folded)).toBe(canonicalize(expected));
          return;
        }
        default: {
          const folded = reduceAll(runId, events);
          const expected = stateFromSerialized(readJson<SerializedState>(caseDir, 'state.json'));
          expect(canonicalize(folded)).toBe(canonicalize(expected));
        }
      }
    });
  }
});
