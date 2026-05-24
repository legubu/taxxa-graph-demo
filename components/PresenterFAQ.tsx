"use client";

// Presenter-only FAQ drawer. Bottom-right button, opens a searchable
// overlay with short Q&A entries for judging-time questions. Decoupled
// from the main demo flow — toggling never touches retrieval state.
// Keyboard: "?" opens (when not typing in an input), "Esc" closes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Entry = {
  section: string;
  q: string;
  a: string;
};

const FAQ: Entry[] = [
  {
    section: "What is real?",
    q: "What in this demo actually runs live per query?",
    a: "Embeddings (Voyage / OpenAI / local), top-k seed selection by cosine similarity, depth-1 BFS along six semantic edge types, subgraph augmentation and pruning, citation chips, and the token metrics. With ANTHROPIC_API_KEY set, the final answer is also generated live by Sonnet 4.6 over the retrieved subgraph.",
  },
  {
    section: "What is curated?",
    q: "What's deterministic / hand-curated?",
    a: "Three per-intent guardrails that order the visible reasoning path, fallback answer strings used when Sonnet is unavailable, and the simulated flat-retrieval chunks used in the comparison panel. Guardrail edges are only applied IF they actually exist in the retrieved subgraph — never fabricated.",
  },
  {
    section: "Why graph retrieval?",
    q: "Why a typed legal graph instead of plain vector search?",
    a: "Tax law is a network of exceptions, definitions, and case interpretations — relationships matter as much as text. A typed graph preserves those edges (EXCEPTION_TO, USES_DEFINITION, INTERPRETS, RULED_ON, IMPLEMENTS) so the system can reason structurally and cite specific authority. Vector-only retrieval loses the wiring.",
  },
  {
    section: "Why not just larger context?",
    q: "Couldn't you just stuff more chunks into a long-context model?",
    a: "You can, and for some questions it works. But you lose auditability (which passage justifies which claim?), pay for blind context, and can't easily explain why one rule overrides another. Graph retrieval surfaces a small typed subgraph plus a stepwise reasoning path that a reviewer can verify edge-by-edge.",
  },
  {
    section: "Does this reduce tokens?",
    q: "Is the value lower token cost per query?",
    a: "Not as a guarantee. The Retrieved-context card uses the same serialize-then-approxTokens heuristic on both sides, and graph context is sometimes comparable to or larger than a tight flat-chunk pack. Token savings can emerge when traversal replaces broad chunk packs — but the headline value is structure and auditability, not raw savings.",
  },
  {
    section: "Does this prove accuracy?",
    q: "Does the demo prove legal correctness?",
    a: "No. It's a hackathon miniature with ~30 hand-curated nodes covering three scripted query patterns. It demonstrates the retrieval architecture and how the explanation surface works; it is not a substitute for canonical Finlex/Vero sources and not a basis for real advice.",
  },
  {
    section: "How would this scale?",
    q: "How does this approach scale from 30 nodes to a real corpus?",
    a: "The retrieval primitives (embed nodes, cosine seeds, depth-bounded BFS along typed edges, prune by score and authority) are corpus-size independent — they just need a graph. The scaling work is ingestion: parsing Finlex XML, Vero guidance, and KHO decisions into typed nodes and edges. The reasoning architecture stays the same.",
  },
  {
    section: "How would graph construction work?",
    q: "How do you build the graph from real Finnish sources?",
    a: "Statutes from Finlex give you Sections and CONTAINS edges almost for free. Cross-references (CITES, EXCEPTION_TO, IMPLEMENTS) come from structured citation patterns in legal text. Vero guidance and KHO decisions attach via INTERPRETS / RULED_ON edges extracted with an LLM pass that's validated against the graph schema. Definitions become reusable nodes linked via USES_DEFINITION.",
  },
  {
    section: "How does this fit Taxxa's existing product?",
    q: "How does graph-aware retrieval fit alongside Taxxa today?",
    a: "It sits between embeddings and answer generation as a structured retrieval layer. Taxxa keeps its current ingestion, UI, and user model; the graph becomes the substrate the assistant reasons over for explainability-heavy queries (audits, complex deductibility, cross-border VAT). It complements vector search rather than replacing it.",
  },
  {
    section: "Where would agents fit?",
    q: "Where do agents come in?",
    a: "The graph turns multi-step legal reasoning into discrete edge traversals an agent can plan against — pick a seed, follow EXCEPTION_TO, check USES_DEFINITION, consult RULED_ON, etc. That's a natural fit for tool-using agents: each typed edge is a structured tool call, and the curated path is the audit trail.",
  },
];

export default function PresenterFAQ() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // "?" opens, Esc closes. Ignore "?" while typing in an input/textarea so
  // it never hijacks the main chat input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "?" && !open) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable)
          return;
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Autofocus the search box when the drawer opens.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ;
    return FAQ.filter((e) =>
      (e.section + " " + e.q + " " + e.a).toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title='Presenter FAQ (press "?")'
        className="fixed bottom-3 right-3 z-40 text-[10px] uppercase tracking-wider text-stone-500 hover:text-stone-800 bg-white/90 hover:bg-white border border-stone-200 rounded-full px-2.5 py-1 backdrop-blur shadow-sm transition-colors"
      >
        Presenter FAQ
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Presenter FAQ"
        >
          <button
            type="button"
            aria-label="Close FAQ"
            onClick={close}
            className="absolute inset-0 bg-stone-900/30"
          />
          <aside className="relative w-[420px] max-w-full h-full bg-white border-l border-stone-200 shadow-2xl flex flex-col">
            <header className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 font-medium">
                  Presenter FAQ
                </div>
                <div className="text-xs text-stone-500">
                  {FAQ.length} short answers · press &quot;?&quot; anywhere
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="text-stone-400 hover:text-stone-800 text-sm"
                aria-label="Close"
              >
                ✕
              </button>
            </header>

            <div className="px-4 py-3 border-b border-stone-200">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search FAQ…"
                className="w-full bg-white border border-stone-200 rounded-md px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-500/60"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {filtered.length === 0 ? (
                <div className="text-xs text-stone-500 italic">
                  No matching entries.
                </div>
              ) : (
                filtered.map((e) => (
                  <div
                    key={e.section}
                    className="rounded-lg border border-stone-200 bg-stone-50/60 p-3"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-amber-800 font-medium mb-1">
                      {e.section}
                    </div>
                    <div className="text-[13px] text-stone-900 font-medium mb-1">
                      {e.q}
                    </div>
                    <p className="text-[12px] text-stone-600 leading-relaxed">
                      {e.a}
                    </p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
