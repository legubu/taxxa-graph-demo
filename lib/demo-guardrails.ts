// Presentation-grade explanation paths.
//
// The retrieval layer (embeddings → seeds → BFS → subgraph) is fully dynamic
// and stays honest behind the dev toggle. This file adds a deterministic
// layer ON TOP: for each of the three scripted demo queries we pin the
// visible reasoning path to a narratively coherent walk through the
// retrieved subgraph, so the demo reads as a clear legal argument rather
// than the raw BFS exploration.
//
// Each guardrail:
//   - matches a query by keyword/regex
//   - lists a narratively-ordered sequence of edges
//   - is only applied if the edge actually exists in the dynamically retrieved
//     subgraph (so it can never invent edges that weren't there)
//
// The full retrieved subgraph is always exposed via the `fullPath` field on
// the API response and via the "show all (dev)" toggle in the UI.

import type { EdgeType, PathStep, Graph } from "./types";
import { edgeToPathStep } from "./retrieval";

export type DemoGuardrail = {
  id: string;
  description: string;
  match: (query: string) => boolean;
  edges: Array<{ from: string; to: string; edge: EdgeType }>;
};

export const DEMO_GUARDRAILS: DemoGuardrail[] = [
  {
    id: "freelancer-b2b-vat",
    description:
      "Cross-border B2B services / reverse charge. Demo query 1.",
    match: (q) => {
      const lc = q.toLowerCase();
      const hasIntent =
        /(freelancer|consult|konsult|b2b|saks|german|germany|cross[- ]?border|reverse charge)/.test(
          lc
        );
      const hasVat =
        /(vat|alv|invoice|invoicing|lasku|article 44)/.test(lc);
      return hasIntent && hasVat;
    },
    edges: [
      // Narrative: lex specialis → grounding definition → EU origin
      //          → Vero interpretation → court application
      { from: "AVL-65", to: "AVL-1", edge: "EXCEPTION_TO" },
      { from: "AVL-65", to: "DEF-ELINK", edge: "USES_DEFINITION" },
      { from: "AVL-65", to: "EU-VAT-44", edge: "IMPLEMENTS" },
      { from: "OHJE-PALV-ULK", to: "AVL-65", edge: "INTERPRETS" },
      { from: "KHO-2019-42", to: "AVL-65", edge: "RULED_ON" },
    ],
  },
  {
    id: "vehicle-input-vat",
    description:
      "Input VAT deductibility on passenger cars and vans. Demo query 2.",
    match: (q) => {
      const lc = q.toLowerCase();
      const hasIntent =
        /(passenger car|henkilöauto|van|pakettiauto|company car|pickup|service van|vehicle|auto|ajoneuvo|driving log|ajopäiväkirja)/.test(
          lc
        );
      const hasVatOrDeduct =
        /(vat|alv|input|deduct|vähennys|vähennyskelpoinen)/.test(lc);
      return hasIntent && hasVatOrDeduct;
    },
    edges: [
      // Narrative: passenger-car carve-out → general restriction → general
      //          deduction right → vehicle definition → Vero guidance →
      //          court application
      { from: "AVL-114a", to: "AVL-114", edge: "EXCEPTION_TO" },
      { from: "AVL-114", to: "AVL-102", edge: "EXCEPTION_TO" },
      { from: "AVL-114a", to: "DEF-HENKAUTO", edge: "USES_DEFINITION" },
      { from: "OHJE-HENKAUTO-ALV", to: "AVL-114a", edge: "INTERPRETS" },
      { from: "KHO-2017-31", to: "AVL-114", edge: "RULED_ON" },
    ],
  },
  {
    id: "entertainment-deductibility",
    description:
      "Alcohol / staff party / client dinner deductibility — EVL vs AVL. Demo query 3.",
    match: (q) => {
      const lc = q.toLowerCase();
      const hasIntent =
        /(alcohol|alkoholi|staff party|pikkujoulu|client dinner|entertainment|edustus|representation|virkistys|henkilökunta|welfare)/.test(
          lc
        );
      const hasDeductOrTax =
        /(deduct|deductib|vähennys|vähennyskelpoinen|income tax|tulovero|vat|alv|corporate)/.test(
          lc
        );
      return hasIntent && hasDeductOrTax;
    },
    edges: [
      // Narrative: classification (EVL → representation definition) →
      //          VAT-side carve-out (AVL-114 → AVL-102) →
      //          unified Vero guidance interprets both → court classification
      { from: "EVL-8", to: "DEF-EDUSTUS", edge: "USES_DEFINITION" },
      { from: "AVL-114", to: "AVL-102", edge: "EXCEPTION_TO" },
      { from: "OHJE-EDUSTUS", to: "EVL-8", edge: "INTERPRETS" },
      { from: "OHJE-EDUSTUS", to: "AVL-114", edge: "INTERPRETS" },
      { from: "KHO-2018-91", to: "EVL-8", edge: "RULED_ON" },
    ],
  },
];

export function findGuardrail(query: string): DemoGuardrail | null {
  return DEMO_GUARDRAILS.find((g) => g.match(query)) ?? null;
}

// Picks guardrail edges that actually exist in the dynamically retrieved
// subgraph, in the order declared by the guardrail. Edges the retrieval
// didn't reach are silently skipped — never fabricated.
export function applyGuardrail(
  guardrail: DemoGuardrail,
  edgeIds: Set<string>,
  graph: Graph
): PathStep[] {
  const bySignature = new Map<string, typeof graph.edges[number]>();
  for (const e of graph.edges) {
    bySignature.set(`${e.source}|${e.target}|${e.type}`, e);
  }
  const steps: PathStep[] = [];
  for (const want of guardrail.edges) {
    const e = bySignature.get(`${want.from}|${want.to}|${want.edge}`);
    if (!e) continue;
    if (!edgeIds.has(e.id)) continue; // edge wasn't in the retrieved subgraph
    steps.push(edgeToPathStep(e, graph));
  }
  return steps;
}
