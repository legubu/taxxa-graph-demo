import type { FlatChunk } from "./flat-chunks";

export type NodeType =
  | "Law"
  | "Section"
  | "Definition"
  | "VeroGuidance"
  | "KHO_Decision"
  | "EUDirective"
  | "Form"
  | "Amendment";

export type EdgeType =
  | "CONTAINS"
  | "EXCEPTION_TO"
  | "CITES"
  | "USES_DEFINITION"
  | "INTERPRETS"
  | "RULED_ON"
  | "IMPLEMENTS"
  | "APPLIES_TO_FORM"
  | "AMENDS"
  | "SUPERSEDES";

export type Authority = "law" | "directive" | "guidance" | "case" | "proposal";

export type GraphNode = {
  id: string;
  type: NodeType;
  label: string;
  text: string;
  aliases?: string;
  authority: Authority;
  position: { x: number; y: number };
  version?: number;
  effectiveFrom?: string;
  hidden?: boolean;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  hidden?: boolean;
};

export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type PathStep = {
  from: string;
  to: string;
  edge: EdgeType;
  rationale: string;
};

export type Citation = {
  node_id: string;
  label: string;
  snippet: string;
};

export type AskResponse = {
  query: string;
  // Identifier of the demo intent that matched this query. Drives the per-
  // intent fallback answer, flat-chunk set, and presentation guardrail. Null
  // when no guardrail matched.
  intent: string | null;
  answer: string;
  citations: Citation[];
  // Curated, presentation-friendly path (4–6 high-value hops, narratively
  // ordered). Drives the visible reasoning list and the graph animation.
  path: PathStep[];
  // Full set of subgraph edges as path steps, in BFS discovery order. For
  // the dev affordance — not visually central.
  fullPath: PathStep[];
  // Subgraph identifiers from the dynamic BFS retrieval.
  subgraph: { nodeIds: string[]; edgeIds: string[] };
  // The simulated flat-retrieval chunks used to compute flatTokens. The UI
  // renders these in the "View context" panel of the comparison card.
  flatChunks: FlatChunk[];
  metrics: {
    graphTokens: number;
    flatTokens: number;
    graphNodeCount: number;
    graphEdgeCount: number;
    seeds: string[];
    embeddingMethod: "voyage" | "openai" | "local";
    answerProvider: "sonnet" | "fallback";
  };
  source: "live" | "fallback";
};
