import { NextRequest, NextResponse } from "next/server";
import graphData from "@/data/graph.json";
import type { AskResponse, Citation, Graph, PathStep } from "@/lib/types";
import { embed, selectMethod, type EmbeddingMethod } from "@/lib/embeddings";
import {
  AUTHORITY_RANK,
  approxTokens,
  bfsSubgraph,
  curatePath,
  ensureSubgraphReachesEdges,
  fullPathFromSubgraph,
  pruneSubgraph,
  serializeFlatContext,
  serializeGraphContext,
  topKSeeds,
} from "@/lib/retrieval";
import { applyGuardrail, findGuardrail } from "@/lib/demo-guardrails";
import {
  generateSonnetAnswer,
  selectAnswerProvider,
  type AnswerProvider,
} from "@/lib/answer-gen";
import {
  DEFAULT_FLAT_CHUNKS,
  FLAT_CHUNKS_BY_INTENT,
  type FlatChunk,
} from "@/lib/flat-chunks";
import { FALLBACK_DATA_BY_INTENT, pickFallback } from "@/lib/fallback-data";

const GRAPH = graphData as Graph;

// Node embeddings are computed lazily once per process and cached. With the
// local backend this is ~ms; with OpenAI it's one batch of API calls.
let nodeEmbeddings: Map<string, number[]> | null = null;
let cachedMethod: EmbeddingMethod | null = null;

async function getNodeEmbeddings(method: EmbeddingMethod) {
  if (nodeEmbeddings && cachedMethod === method) return nodeEmbeddings;
  const map = new Map<string, number[]>();
  for (const n of GRAPH.nodes) {
    if (n.hidden) continue;
    const text = [n.label, n.text, n.aliases ?? ""].join(" ");
    map.set(n.id, await embed(text, method));
  }
  nodeEmbeddings = map;
  cachedMethod = method;
  return map;
}

function buildCitations(
  subgraphNodeIds: Set<string>,
  graph: Graph,
  qVec: number[],
  embeddings: Map<string, number[]>
): Citation[] {
  const SOURCE_TYPES = new Set([
    "Section",
    "VeroGuidance",
    "KHO_Decision",
    "EUDirective",
  ]);
  const nodes = graph.nodes.filter(
    (n) => subgraphNodeIds.has(n.id) && SOURCE_TYPES.has(n.type) && !n.hidden
  );
  nodes.sort((a, b) => {
    const aSim = embeddings.has(a.id)
      ? cosineLike(qVec, embeddings.get(a.id)!)
      : 0;
    const bSim = embeddings.has(b.id)
      ? cosineLike(qVec, embeddings.get(b.id)!)
      : 0;
    if (Math.abs(aSim - bSim) > 0.02) return bSim - aSim;
    return AUTHORITY_RANK[a.authority] - AUTHORITY_RANK[b.authority];
  });
  return nodes.slice(0, 4).map((n) => ({
    node_id: n.id,
    label: n.label,
    snippet:
      n.text.length > 140 ? n.text.slice(0, 137).trimEnd() + "…" : n.text,
  }));
}

function cosineLike(a: number[], b: number[]): number {
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

// Both budgets are computed the same way: serialize the prompt-like context
// each method would send to an LLM, then run the same approxTokens heuristic
// over the result. This is an approximation — it counts characters of the
// rendered context, not BPE tokens, so real tokenizer counts will differ —
// but it applies the same rule to both sides so the comparison is honest.
function flatTokenCount(chunks: FlatChunk[]): number {
  return approxTokens(serializeFlatContext(chunks));
}

function graphTokenCount(
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  path: PathStep[]
): number {
  const nodes = GRAPH.nodes.filter((n) => nodeIds.has(n.id));
  const edges = GRAPH.edges.filter((e) => edgeIds.has(e.id));
  return approxTokens(serializeGraphContext(nodes, edges, path));
}

// Fallback wraps the per-intent canned response, refreshing the embedding
// method and answer provider tags so the UI badges still reflect current
// configuration. In this branch generation has not been attempted (or has
// failed before we have a subgraph), so answerProvider is always "fallback".
function fallbackResponse(query: string, method: EmbeddingMethod): AskResponse {
  const base = pickFallback(query);
  return {
    ...base,
    query,
    metrics: {
      ...base.metrics,
      embeddingMethod: method,
      answerProvider: "fallback",
    },
  };
}

export async function POST(req: NextRequest) {
  let query = "";
  try {
    const body = (await req.json()) as { query?: string };
    query = (body.query ?? "").trim();
  } catch {
    // ignore — empty query falls through to fallback
  }
  const method = selectMethod();

  if (!query) {
    return NextResponse.json(fallbackResponse(query, method));
  }

  try {
    const embeddings = await getNodeEmbeddings(method);
    const qVec = await embed(query, method);
    const seeds = topKSeeds(qVec, GRAPH.nodes, embeddings, 3);
    if (seeds.length === 0) {
      return NextResponse.json(fallbackResponse(query, method));
    }
    // Depth 1 from 3 seeds yields a tight ~6–10 node subgraph in our curated
    // 30-node graph. Depth 2 reaches almost every node and defeats the
    // "smaller, targeted context" comparison.
    const bfs = bfsSubgraph(GRAPH, seeds.map((s) => s.id), 1);
    if (bfs.nodeIds.size === 0) {
      return NextResponse.json(fallbackResponse(query, method));
    }

    // Intent dispatch. Drives the canned answer text, the per-intent flat
    // chunks for the comparison panel, and the presentation guardrail.
    const guardrail = findGuardrail(query);
    const intent = guardrail?.id ?? null;

    // If a guardrail matched, augment the subgraph along the guardrail's
    // edges — but only by pulling in nodes that are one hop away from what
    // BFS already found. The retrieval stays grounded in the graph; this
    // step just ensures the narrative anchors are structurally reachable.
    const augmented = guardrail
      ? ensureSubgraphReachesEdges(
          guardrail.edges,
          bfs.nodeIds,
          bfs.edgeIds,
          GRAPH
        )
      : { nodeIds: bfs.nodeIds, edgeIds: bfs.edgeIds, augmentedNodes: [], augmentedEdges: [] };

    // Prune to keep the targeted-context claim honest. Protected from pruning:
    // dynamic seeds, guardrail-augmented anchors, and any guardrail endpoints
    // that BFS already reached.
    const protectedNodes = new Set<string>();
    for (const s of seeds) {
      if (augmented.nodeIds.has(s.id)) protectedNodes.add(s.id);
    }
    for (const id of augmented.augmentedNodes) protectedNodes.add(id);
    if (guardrail) {
      for (const e of guardrail.edges) {
        if (augmented.nodeIds.has(e.from)) protectedNodes.add(e.from);
        if (augmented.nodeIds.has(e.to)) protectedNodes.add(e.to);
      }
    }
    const pruned = pruneSubgraph(
      augmented.nodeIds,
      augmented.edgeIds,
      protectedNodes,
      qVec,
      embeddings,
      GRAPH,
      10
    );
    const nodeIds = pruned.nodeIds;
    const edgeIds = pruned.edgeIds;
    const flatChunks = intent
      ? FLAT_CHUNKS_BY_INTENT[intent] ?? DEFAULT_FLAT_CHUNKS
      : DEFAULT_FLAT_CHUNKS;
    const cannedAnswer = intent
      ? FALLBACK_DATA_BY_INTENT[intent]?.answer ??
        FALLBACK_DATA_BY_INTENT["freelancer-b2b-vat"].answer
      : FALLBACK_DATA_BY_INTENT["freelancer-b2b-vat"].answer;

    // Citations come from the retrieved subgraph; if a guardrail is active,
    // we additionally restrict them to nodes that actually appear in the
    // visible reasoning path so the chips and the narrative stay in sync.
    let citations = buildCitations(nodeIds, GRAPH, qVec, embeddings);

    // Presentation path. Guardrail first (deterministic narrative ordering
    // of edges that ACTUALLY exist in the retrieved subgraph); top up with
    // the score-based curator if the guardrail returns fewer than 4 hops.
    const path = guardrail ? applyGuardrail(guardrail, edgeIds, GRAPH) : [];
    if (path.length < 4) {
      const curated = curatePath(
        edgeIds,
        nodeIds,
        GRAPH,
        qVec,
        embeddings,
        seeds.map((s) => s.id),
        5
      );
      const usedSigs = new Set(
        path.map((p) => `${p.from}|${p.to}|${p.edge}`)
      );
      for (const step of curated) {
        if (path.length >= 5) break;
        const sig = `${step.from}|${step.to}|${step.edge}`;
        if (usedSigs.has(sig)) continue;
        path.push(step);
        usedSigs.add(sig);
      }
    }

    if (guardrail && path.length > 0) {
      const SOURCE_TYPES = new Set([
        "Section",
        "VeroGuidance",
        "KHO_Decision",
        "EUDirective",
      ]);
      const pathNodeIds = new Set(path.flatMap((p) => [p.from, p.to]));
      const pathCitationNodes = GRAPH.nodes
        .filter(
          (n) =>
            pathNodeIds.has(n.id) && SOURCE_TYPES.has(n.type) && !n.hidden
        )
        .sort((a, b) => {
          const aSim = embeddings.has(a.id)
            ? cosineLike(qVec, embeddings.get(a.id)!)
            : 0;
          const bSim = embeddings.has(b.id)
            ? cosineLike(qVec, embeddings.get(b.id)!)
            : 0;
          if (Math.abs(aSim - bSim) > 0.02) return bSim - aSim;
          return AUTHORITY_RANK[a.authority] - AUTHORITY_RANK[b.authority];
        });
      if (pathCitationNodes.length >= 3) {
        citations = pathCitationNodes.slice(0, 4).map((n) => ({
          node_id: n.id,
          label: n.label,
          snippet:
            n.text.length > 140
              ? n.text.slice(0, 137).trimEnd() + "…"
              : n.text,
        }));
      }
    }

    const fullPath = fullPathFromSubgraph(edgeIds, GRAPH);

    // Optional Sonnet generation. The retrieval pipeline above is unchanged;
    // this only swaps the answer text at the end. On no API key, network
    // failure, timeout, or empty/parse error, generateSonnetAnswer returns
    // null and we keep the canned per-intent answer so the demo stays
    // reproducible offline.
    let answer = cannedAnswer;
    let answerProvider: AnswerProvider = "fallback";
    if (selectAnswerProvider() === "sonnet") {
      const subgraphNodes = GRAPH.nodes.filter((n) => nodeIds.has(n.id));
      const subgraphEdges = GRAPH.edges.filter((e) => edgeIds.has(e.id));
      const generated = await generateSonnetAnswer(
        query,
        subgraphNodes,
        subgraphEdges,
        path,
        citations
      );
      if (generated) {
        answer = generated;
        answerProvider = "sonnet";
      }
    }

    const response: AskResponse = {
      query,
      intent,
      answer,
      citations,
      path,
      fullPath,
      subgraph: { nodeIds: [...nodeIds], edgeIds: [...edgeIds] },
      flatChunks,
      metrics: {
        graphTokens: graphTokenCount(nodeIds, edgeIds, path),
        flatTokens: flatTokenCount(flatChunks),
        graphNodeCount: nodeIds.size,
        graphEdgeCount: edgeIds.size,
        seeds: seeds.map((s) => s.id),
        embeddingMethod: method,
        answerProvider,
      },
      source: "live",
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/ask] retrieval failed, returning fallback:", err);
    return NextResponse.json(fallbackResponse(query, method));
  }
}
