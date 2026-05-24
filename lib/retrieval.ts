import type {
  Graph,
  GraphNode,
  GraphEdge,
  EdgeType,
  PathStep,
  Authority,
} from "./types";
import type { FlatChunk } from "./flat-chunks";

// Edge-type base scores for the presentation-layer path curator.
// High value: edges that carry clear legal-reasoning weight.
// Low value: cross-references, which often add noise without insight.
const EDGE_BASE_SCORE: Record<EdgeType, number> = {
  INTERPRETS: 1.0,
  IMPLEMENTS: 1.0,
  RULED_ON: 1.0,
  EXCEPTION_TO: 0.95,
  USES_DEFINITION: 0.75,
  CITES: 0.15,
  CONTAINS: 0,
  APPLIES_TO_FORM: 0,
  AMENDS: 0,
  SUPERSEDES: 0,
};

// Edges that BFS may walk to expand from seeds. Excludes pure structural
// (CONTAINS), administrative (APPLIES_TO_FORM), and versioning edges
// (AMENDS, SUPERSEDES).
export const SEMANTIC_EDGES: EdgeType[] = [
  "EXCEPTION_TO",
  "CITES",
  "USES_DEFINITION",
  "INTERPRETS",
  "RULED_ON",
  "IMPLEMENTS",
];

const SEED_TYPES = new Set([
  "Section",
  "VeroGuidance",
  "KHO_Decision",
  "EUDirective",
]);

export const AUTHORITY_RANK: Record<Authority, number> = {
  law: 0,
  directive: 1,
  guidance: 2,
  case: 3,
  proposal: 4,
};

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export function topKSeeds(
  qVec: number[],
  nodes: GraphNode[],
  embeddings: Map<string, number[]>,
  k = 3
): GraphNode[] {
  return nodes
    .filter((n) => !n.hidden && SEED_TYPES.has(n.type) && embeddings.has(n.id))
    .map((n) => ({ n, sim: cosine(qVec, embeddings.get(n.id)!) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k)
    .map((x) => x.n);
}

export const RATIONALE_TEMPLATES: Record<
  EdgeType,
  (from: string, to: string) => string
> = {
  EXCEPTION_TO: (f, t) =>
    `${f} is a specific rule overriding the general rule in ${t}.`,
  USES_DEFINITION: (f, t) => `${f} relies on the definition of ${t}.`,
  IMPLEMENTS: (f, t) => `${f} implements ${t}.`,
  INTERPRETS: (f, t) => `${f} provides Vero guidance on how to apply ${t}.`,
  RULED_ON: (f, t) => `${f} applied ${t} to a concrete case.`,
  CITES: (f, t) => `${f} cross-references ${t}.`,
  CONTAINS: (f, t) => `${f} contains ${t}.`,
  APPLIES_TO_FORM: (f, t) => `${f} is reported on ${t}.`,
  AMENDS: (f, t) => `${f} amends ${t}.`,
  SUPERSEDES: (f, t) => `${f} supersedes ${t}.`,
};

export function bfsSubgraph(
  graph: Graph,
  seedIds: string[],
  maxDepth = 2,
  allowed: EdgeType[] = SEMANTIC_EDGES
): { nodeIds: Set<string>; edgeIds: Set<string>; path: PathStep[] } {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>(seedIds);
  const edgeIds = new Set<string>();
  const path: PathStep[] = [];

  let frontier = seedIds.filter((id) => nodeById.get(id) && !nodeById.get(id)!.hidden);

  for (let d = 0; d < maxDepth; d++) {
    const nextFrontier: string[] = [];
    for (const fromId of frontier) {
      for (const e of graph.edges) {
        if (e.hidden) continue;
        if (!allowed.includes(e.type)) continue;
        if (e.source !== fromId && e.target !== fromId) continue;

        const otherId = e.source === fromId ? e.target : e.source;
        const otherNode = nodeById.get(otherId);
        if (!otherNode || otherNode.hidden) continue;

        edgeIds.add(e.id);
        if (!visited.has(otherId)) {
          visited.add(otherId);
          nextFrontier.push(otherId);
          // Record path step in the edge's canonical direction.
          const fromLabel = nodeById.get(e.source)?.label ?? e.source;
          const toLabel = nodeById.get(e.target)?.label ?? e.target;
          path.push({
            from: e.source,
            to: e.target,
            edge: e.type,
            rationale: RATIONALE_TEMPLATES[e.type](fromLabel, toLabel),
          });
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return { nodeIds: visited, edgeIds, path };
}

// Loose token estimate: ~4 chars per token for Latin text, ~3 for Finnish
// (more diacritics + agglutination). We average to 3.5. This is an
// approximation; a real BPE tokenizer (tiktoken, etc.) will differ.
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// Render the flat-retrieval chunks as the prompt-like context a flat RAG
// pipeline would assemble: an ID/source header per chunk, the chunk text,
// and a separator between chunks.
export function serializeFlatContext(chunks: FlatChunk[]): string {
  return chunks
    .map((c) => `[${c.id}] ${c.source}\n${c.text}`)
    .join("\n\n---\n\n");
}

// Render the retrieved subgraph as the prompt-like context a graph-aware
// pipeline would assemble: a labelled block per node (id, label, type,
// authority, text), then the typed edges as `source --EDGE_TYPE--> target`,
// and — when provided — the curated reasoning path with rationales.
export function serializeGraphContext(
  nodes: GraphNode[],
  edges: GraphEdge[],
  path?: PathStep[]
): string {
  const parts: string[] = [];
  if (nodes.length > 0) {
    parts.push(
      nodes
        .map(
          (n) =>
            `[${n.id}] ${n.label} (${n.type}, ${n.authority})\n${n.text}`
        )
        .join("\n\n")
    );
  }
  if (edges.length > 0) {
    parts.push(
      "Edges:\n" +
        edges
          .map((e) => `${e.source} --${e.type}--> ${e.target}`)
          .join("\n")
    );
  }
  if (path && path.length > 0) {
    parts.push(
      "Reasoning:\n" +
        path
          .map(
            (p) => `- ${p.from} --${p.edge}--> ${p.to}: ${p.rationale}`
          )
          .join("\n")
    );
  }
  return parts.join("\n\n");
}

function makeStep(
  edge: GraphEdge,
  nodeById: Map<string, GraphNode>
): PathStep {
  const fromLabel = nodeById.get(edge.source)?.label ?? edge.source;
  const toLabel = nodeById.get(edge.target)?.label ?? edge.target;
  return {
    from: edge.source,
    to: edge.target,
    edge: edge.type,
    rationale: RATIONALE_TEMPLATES[edge.type](fromLabel, toLabel),
  };
}

// Public wrapper for callers (e.g., the demo guardrail) that need to convert
// a graph edge into a labelled PathStep without going through the scorer.
export function edgeToPathStep(edge: GraphEdge, graph: Graph): PathStep {
  return makeStep(edge, new Map(graph.nodes.map((n) => [n.id, n])));
}

// All semantic edges that fall inside the retrieved subgraph, converted to
// PathStep[]. Used to populate fullPath for the dev affordance.
export function fullPathFromSubgraph(
  edgeIds: Set<string>,
  graph: Graph
): PathStep[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  return graph.edges
    .filter(
      (e) =>
        edgeIds.has(e.id) &&
        !e.hidden &&
        SEMANTIC_EDGES.includes(e.type)
    )
    .map((e) => makeStep(e, nodeById));
}

// Subgraph pruning. After BFS + guardrail augmentation, the subgraph can
// grow beyond what makes sense as "targeted context". This trims it back
// to `maxNodes`, protecting:
//   - seeds (chosen by query similarity)
//   - guardrail endpoints (needed for the visible narrative path)
//   - augmented nodes (added to make the guardrail reachable)
// Remaining slots are filled by query similarity. Edges whose endpoints
// don't survive are dropped.
export function pruneSubgraph(
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  protectedNodes: Set<string>,
  qVec: number[],
  embeddings: Map<string, number[]>,
  graph: Graph,
  maxNodes: number
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  if (nodeIds.size <= maxNodes) return { nodeIds, edgeIds };

  const candidates = [...nodeIds]
    .filter((id) => !protectedNodes.has(id))
    .map((id) => ({
      id,
      sim: embeddings.has(id) ? cosine(qVec, embeddings.get(id)!) : 0,
    }))
    .sort((a, b) => b.sim - a.sim);

  const keep = new Set<string>();
  for (const id of protectedNodes) {
    if (nodeIds.has(id)) keep.add(id);
  }
  for (const { id } of candidates) {
    if (keep.size >= maxNodes) break;
    keep.add(id);
  }

  const keptEdges = new Set<string>();
  for (const e of graph.edges) {
    if (!edgeIds.has(e.id)) continue;
    if (keep.has(e.source) && keep.has(e.target)) {
      keptEdges.add(e.id);
    }
  }

  return { nodeIds: keep, edgeIds: keptEdges };
}

// Targeted subgraph augmentation. For each declared edge, if one endpoint is
// ALREADY in the BFS-retrieved subgraph and the other is one hop away in the
// graph, add the missing endpoint and the edge. Never invents edges or pulls
// in nodes that aren't structurally reachable from what BFS already found —
// this is "extend retrieval to ensure narrative anchors are reachable",
// nothing more.
export function ensureSubgraphReachesEdges(
  required: Array<{ from: string; to: string; edge: EdgeType }>,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  graph: Graph
): {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  augmentedNodes: string[];
  augmentedEdges: string[];
} {
  const newNodeIds = new Set(nodeIds);
  const newEdgeIds = new Set(edgeIds);
  const augmentedNodes: string[] = [];
  const augmentedEdges: string[] = [];

  for (const want of required) {
    const fromIn = newNodeIds.has(want.from);
    const toIn = newNodeIds.has(want.to);
    if (fromIn && toIn) continue;
    // Both endpoints missing = guardrail node is structurally unconnected to
    // what BFS found. Skip — never fabricate.
    if (!fromIn && !toIn) continue;
    const e = graph.edges.find(
      (x) =>
        x.source === want.from &&
        x.target === want.to &&
        x.type === want.edge &&
        !x.hidden
    );
    if (!e) continue;
    if (!fromIn) {
      newNodeIds.add(want.from);
      augmentedNodes.push(want.from);
    }
    if (!toIn) {
      newNodeIds.add(want.to);
      augmentedNodes.push(want.to);
    }
    if (!newEdgeIds.has(e.id)) {
      newEdgeIds.add(e.id);
      augmentedEdges.push(e.id);
    }
  }

  return { nodeIds: newNodeIds, edgeIds: newEdgeIds, augmentedNodes, augmentedEdges };
}

// Curated presentation path. The strategy:
//   1. Score every semantic edge inside the retrieved subgraph by:
//        base(edge type)                  — INTERPRETS/IMPLEMENTS/RULED_ON
//                                           score highest; CITES is demoted
//      + avg(endpoint similarity to query)
//      + authority bonus (law endpoints)
//      + seed bonus (edges that touch the seed nodes are doubly grounded)
//      − noise penalty (an endpoint in the bottom 30% of subgraph similarity)
//   2. Drop any candidate below a quality floor.
//   3. Take the top `targetHops` (default 5).
//   4. Re-order as a connected narrative walk: start with the top-scored
//      hop, then repeatedly attach the next-best hop that touches a node
//      already in the walk. Cap from-node repetition softly (≤ 3) so the
//      walk doesn't degenerate into one node × N spokes.
// The result is a 4–6 hop sequence that reads as a single connected story
// rather than a flat dump of BFS discoveries.
export function curatePath(
  edgeIds: Set<string>,
  nodeIds: Set<string>,
  graph: Graph,
  qVec: number[],
  embeddings: Map<string, number[]>,
  seeds: string[],
  targetHops = 5
): PathStep[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const seedSet = new Set(seeds);

  // Per-node similarity to the query (computed once).
  const nodeSim = new Map<string, number>();
  for (const id of nodeIds) {
    nodeSim.set(
      id,
      embeddings.has(id) ? cosine(qVec, embeddings.get(id)!) : 0
    );
  }
  // Relative noise threshold so the curator works across embedding methods
  // (OpenAI vs the local hashed n-gram) without hardcoded magic numbers.
  const sortedSims = [...nodeSim.values()].sort((a, b) => a - b);
  const noiseThreshold =
    sortedSims.length > 0
      ? sortedSims[Math.max(0, Math.floor(sortedSims.length * 0.3))]
      : 0;

  type Candidate = { edge: GraphEdge; score: number };

  const candidates: Candidate[] = [];
  for (const e of graph.edges) {
    if (!edgeIds.has(e.id)) continue;
    if (e.hidden) continue;
    if (!SEMANTIC_EDGES.includes(e.type)) continue;
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;

    const fromNode = nodeById.get(e.source);
    const toNode = nodeById.get(e.target);
    if (!fromNode || !toNode) continue;

    const base = EDGE_BASE_SCORE[e.type];
    if (base <= 0) continue;

    const relFrom = nodeSim.get(e.source) ?? 0;
    const relTo = nodeSim.get(e.target) ?? 0;
    const relevance = (relFrom + relTo) / 2;
    const authBoost =
      (fromNode.authority === "law" ? 0.05 : 0) +
      (toNode.authority === "law" ? 0.05 : 0);
    const seedBoost =
      seedSet.has(e.source) && seedSet.has(e.target)
        ? 0.15
        : seedSet.has(e.source) || seedSet.has(e.target)
        ? 0.05
        : 0;
    const noisePenalty =
      relFrom < noiseThreshold || relTo < noiseThreshold ? 0.25 : 0;

    candidates.push({
      edge: e,
      score: base + relevance + authBoost + seedBoost - noisePenalty,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // Soft from-node diversity: allow at most 3 picks sharing the same `from`.
  // Keeps a hub-and-spoke shape (which is correct when the subgraph really
  // does center on a single section) without letting one node monopolize the
  // entire path.
  const picks: Candidate[] = [];
  const fromCounts = new Map<string, number>();
  const FROM_CAP = 3;
  for (const c of candidates) {
    if (picks.length >= targetHops) break;
    const fc = fromCounts.get(c.edge.source) ?? 0;
    if (fc >= FROM_CAP) continue;
    picks.push(c);
    fromCounts.set(c.edge.source, fc + 1);
  }

  if (picks.length <= 1) {
    return picks.map((p) => makeStep(p.edge, nodeById));
  }

  // Narrative ordering: greedy connected walk seeded by the top-scored hop.
  const ordered: Candidate[] = [];
  const seen = new Set<string>();
  const remaining = [...picks];

  const first = remaining.shift()!;
  ordered.push(first);
  seen.add(first.edge.source);
  seen.add(first.edge.target);

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const connects =
        seen.has(c.edge.source) || seen.has(c.edge.target);
      if (connects && c.score > bestScore) {
        bestScore = c.score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) bestIdx = 0;
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    seen.add(next.edge.source);
    seen.add(next.edge.target);
  }

  return ordered.map((p) => makeStep(p.edge, nodeById));
}
