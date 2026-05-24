// Optional Anthropic Sonnet 4.6 answer generation.
//
// If ANTHROPIC_API_KEY is set we ask Sonnet to write the answer, grounding
// it in the same serialized graph context the comparison panel scores
// (lib/retrieval.ts — serializeGraphContext). If the key is absent, the
// call fails, the network times out, or the response is unparseable, we
// return null and the caller uses the canned per-intent fallback answer.
//
// The retrieval pipeline is untouched. This module only swaps the answer
// string at the very end.

import type { GraphNode, GraphEdge, PathStep, Citation } from "./types";
import { serializeGraphContext } from "./retrieval";

export type AnswerProvider = "sonnet" | "fallback";

export function selectAnswerProvider(): AnswerProvider {
  return process.env.ANTHROPIC_API_KEY ? "sonnet" : "fallback";
}

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 20_000;
const MAX_TOKENS = 700;

const SYSTEM_PROMPT = `You are Taxxa, a Finnish tax assistant.

You will be given a user question and a typed legal subgraph retrieved
from a curated Finnish-tax knowledge graph (statutes, EU directive
articles, Vero guidance, KHO cases, and definitions). The subgraph is
presented as labelled nodes, typed edges (e.g. EXCEPTION_TO,
USES_DEFINITION, INTERPRETS, RULED_ON, IMPLEMENTS), and a curated
reasoning path of typed hops.

Rules:
- Ground every claim in the supplied subgraph. Do not invent statutes,
  case numbers, or guidance documents.
- Cite by node label (e.g. "AVL § 65", "KHO:2019:42", "VAT Directive
  Art. 44") inline where relevant.
- Be concise: 4-7 sentences, plain English, no bullet lists.
- If the subgraph is insufficient to answer, say so plainly. Do not
  speculate beyond it.`;

export async function generateSonnetAnswer(
  query: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  path: PathStep[],
  citations: Citation[]
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const context = serializeGraphContext(nodes, edges, path);
  const citationList = citations
    .map((c) => `- ${c.label} (${c.node_id}): ${c.snippet}`)
    .join("\n");

  const userMessage = `Question:\n${query}\n\nRetrieved subgraph:\n${context}\n\nCitations surfaced by retrieval:\n${citationList}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(
        `[answer-gen] Sonnet ${res.status}: ${await res.text().catch(() => "")}`
      );
      return null;
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    console.warn("[answer-gen] Sonnet call failed, using fallback:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
