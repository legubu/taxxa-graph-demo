"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Core } from "cytoscape";
import Canvas from "@/components/Canvas";
import PresenterFAQ from "@/components/PresenterFAQ";
import graph from "@/data/graph.json";
import type { AskResponse } from "@/lib/types";
import { QUERIES, FALLBACK_DATA_BY_INTENT } from "@/lib/fallback-data";

const QUERY_IDS = [
  "freelancer-b2b-vat",
  "vehicle-input-vat",
  "entertainment-deductibility",
] as const;
type QueryId = (typeof QUERY_IDS)[number];

const AUTHORITY_ORDER: { key: string; label: string }[] = [
  { key: "law", label: "Law" },
  { key: "directive", label: "Directive" },
  { key: "guidance", label: "Guidance" },
  { key: "case", label: "Case" },
];

// One-line plain-English descriptions for each typed edge. Surfaced as
// tooltips on the reasoning-path edge labels and shown in the canvas's
// edge-type legend, so the meaning of "EXCEPTION_TO" / "USES_DEFINITION"
// etc. is discoverable inline without leaving the answer view.
const EDGE_DESCRIPTIONS: Record<string, string> = {
  EXCEPTION_TO: "Specific rule that overrides a more general rule.",
  USES_DEFINITION: "Depends on the definition of another node.",
  INTERPRETS: "Vero guidance on how to apply a statute.",
  RULED_ON: "Court case that applied a statute to a concrete situation.",
  IMPLEMENTS: "Finnish statute implements an EU directive article.",
  CITES: "Cross-reference between two sources.",
  CONTAINS: "Structural: a law contains a section.",
  APPLIES_TO_FORM: "A rule maps onto a tax-form field.",
  AMENDS: "Versioning: this text amends an earlier statute.",
  SUPERSEDES: "Versioning: this text replaces an earlier one.",
};

// The six semantic edge types the retriever traverses, with the canvas
// stroke colour + line style they're drawn with (kept in sync with
// EDGE_COLORS / EDGE_STYLES in components/Canvas.tsx).
const EDGE_LEGEND: { type: string; color: string; style: string }[] = [
  { type: "EXCEPTION_TO", color: "#ea580c", style: "solid" },
  { type: "USES_DEFINITION", color: "#a78bfa", style: "dotted" },
  { type: "INTERPRETS", color: "#10b981", style: "dashed" },
  { type: "RULED_ON", color: "#0e7490", style: "solid" },
  { type: "IMPLEMENTS", color: "#94a3b8", style: "solid" },
  { type: "CITES", color: "#94a3b8", style: "dashed" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Home() {
  const cyRef = useRef<Core | null>(null);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [running, setRunning] = useState(false);
  const [showFlatContext, setShowFlatContext] = useState(false);
  const [showGraphContext, setShowGraphContext] = useState(false);
  const [showFullPath, setShowFullPath] = useState(false);
  // No query is selected on first paint. The demo waits for the user to
  // pick one of the suggested cards before fetching anything.
  const [activeQueryId, setActiveQueryId] = useState<QueryId | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [data, setData] = useState<AskResponse | null>(null);
  const [retrievalState, setRetrievalState] = useState<
    "idle" | "loading" | "live" | "fallback"
  >("idle");

  // Resizable split between chat (left) and explainability (right).
  // Width is stored as a percentage of the viewport so the layout
  // scales with the window. The drag is driven by pointer events with
  // setPointerCapture on the divider, which routes every subsequent
  // pointer event to the divider regardless of what's underneath —
  // bulletproof against cytoscape (or anything else) trying to capture
  // events while the user drags across the right pane.
  const [leftPanePct, setLeftPanePct] = useState(62);
  const draggingRef = useRef(false);

  function onDividerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function onDividerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const pct = (e.clientX / window.innerWidth) * 100;
    // 38–78 % — keeps the right pane visible while letting the user
    // pull the chat as wide as makes sense for reading.
    setLeftPanePct(Math.max(38, Math.min(78, pct)));
    // Resize cytoscape live during the drag so the canvas tracks the
    // new container size frame-by-frame instead of snapping at release.
    const cy = cyRef.current;
    if (cy && !cy.destroyed()) cy.resize();
  }

  function onDividerPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // releasePointerCapture throws if the capture was already lost
      // (e.g. element was unmounted). Safe to ignore.
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const cy = cyRef.current;
    if (cy && !cy.destroyed()) cy.resize();
  }

  const displayPath = data ? (showFullPath ? data.fullPath : data.path) : [];

  function selectQuery(id: QueryId) {
    if (id === activeQueryId) return;
    setActiveStep(-1);
    setRunning(false);
    setShowFullPath(false);
    setShowFlatContext(false);
    setShowGraphContext(false);
    setSelectedSourceId(null);
    setRetrievalState("loading");
    setActiveQueryId(id);
  }

  useEffect(() => {
    if (!activeQueryId) return;
    let cancelled = false;
    const question = QUERIES[activeQueryId].question;
    (async () => {
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: question }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as AskResponse;
        if (cancelled) return;
        setData(json);
        setRetrievalState(json.source === "live" ? "live" : "fallback");
      } catch (err) {
        console.warn("[/api/ask] failed, using fallback:", err);
        if (!cancelled) {
          setData(FALLBACK_DATA_BY_INTENT[activeQueryId]);
          setRetrievalState("fallback");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeQueryId]);

  const nodesByAuthority = useMemo(() => {
    if (!data) return [];
    const subgraphIds = new Set(data.subgraph.nodeIds);
    const pool = graph.nodes.filter((n) => subgraphIds.has(n.id));
    return AUTHORITY_ORDER.map((a) => ({
      ...a,
      nodes: pool.filter((n) => n.authority === a.key),
    })).filter((g) => g.nodes.length > 0);
  }, [data]);

  const subgraphEdgeTypes = useMemo(() => {
    if (!data) return [];
    const edgeIds = new Set(data.subgraph.edgeIds);
    return [
      ...new Set(
        graph.edges.filter((e) => edgeIds.has(e.id)).map((e) => e.type)
      ),
    ];
  }, [data]);

  const focusedGraph = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    const nodeIdSet = new Set(data.subgraph.nodeIds);
    const edgeIdSet = new Set(data.subgraph.edgeIds);
    return {
      nodes: graph.nodes.filter(
        (n) => nodeIdSet.has(n.id) && (!("hidden" in n) || !n.hidden)
      ),
      edges: graph.edges.filter((e) => edgeIdSet.has(e.id)),
    };
  }, [data]);

  const totalVisibleNodes = useMemo(
    () =>
      graph.nodes.filter((n) => !("hidden" in n) || !n.hidden).length,
    []
  );

  // Node-tap handler kept in a ref so handleReady can stay a stable
  // useCallback (otherwise its identity changes every render and the
  // Canvas would re-init cytoscape on every state change). The ref is
  // updated in an effect after each render so it always points at the
  // latest closure, reading fresh selectedSourceId / running state.
  const nodeTapRef = useRef<((id: string) => void) | null>(null);
  useEffect(() => {
    nodeTapRef.current = (id: string) => {
      if (running) return;
      if (selectedSourceId === id) {
        setSelectedSourceId(null);
        resetView();
      } else {
        setSelectedSourceId(id);
        focusNode(id);
      }
    };
  });

  const handleReady = useCallback((cy: Core) => {
    cyRef.current = cy;
    cy.fit(undefined, 80);

    // Tap any node → open its excerpt in the source-preview block and
    // highlight that node + its immediate edges on the canvas. Same
    // behaviour as clicking a citation chip.
    cy.on("tap", "node", (e) => {
      const id = e.target.id();
      nodeTapRef.current?.(id);
    });

    // Visual affordance: pointer cursor over nodes so they read as
    // interactive elements rather than passive shapes.
    cy.on("mouseover", "node", () => {
      const c = cy.container();
      if (c) c.style.cursor = "pointer";
    });
    cy.on("mouseout", "node", () => {
      const c = cy.container();
      if (c) c.style.cursor = "";
    });
  }, []);

  // When the selected source changes (from chip click OR canvas tap),
  // scroll the source-preview block into view so the user always sees
  // the excerpt immediately, even if they tapped a node off-screen.
  const sourcePreviewRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!selectedSourceId) return;
    sourcePreviewRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selectedSourceId]);

  async function animatePath() {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || running || displayPath.length === 0) return;
    setRunning(true);
    setActiveStep(-1);

    cy.elements().removeClass("active-path glow seed dim");
    cy.elements().addClass("dim");

    for (let i = 0; i < displayPath.length; i++) {
      if (cy.destroyed() || cy !== cyRef.current) {
        setRunning(false);
        setActiveStep(-1);
        return;
      }
      const step = displayPath[i];
      const edge = cy
        .edges()
        .filter(
          (e) =>
            e.data("source") === step.from &&
            e.data("target") === step.to &&
            e.data("type") === step.edge
        );
      const fromNode = cy.getElementById(step.from);
      const toNode = cy.getElementById(step.to);

      edge.removeClass("dim").addClass("active-path");
      fromNode.removeClass("dim").addClass("glow");
      toNode.removeClass("dim").addClass("glow");

      setActiveStep(i);
      cy.animate(
        { fit: { eles: edge.union(fromNode).union(toNode), padding: 80 } },
        { duration: 350 }
      );
      await sleep(750);
    }

    if (cy.destroyed() || cy !== cyRef.current) {
      setRunning(false);
      setActiveStep(-1);
      return;
    }
    const highlighted = cy.elements(".active-path, .glow");
    cy.animate({ fit: { eles: highlighted, padding: 60 } }, { duration: 500 });
    setRunning(false);
  }

  function resetView() {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    cy.elements().removeClass("active-path glow seed dim");
    if (!data) return;
    const subgraphIds = new Set(data.subgraph.nodeIds);
    const subgraphNodes = cy.nodes().filter((n) => subgraphIds.has(n.id()));
    const target = subgraphNodes.length > 0 ? subgraphNodes : cy.elements();
    cy.animate({ fit: { eles: target, padding: 60 } }, { duration: 400 });
    setActiveStep(-1);
  }

  // Single-step focus: highlight ONE reasoning hop (edge + endpoints) on
  // the canvas, fade the rest of the subgraph. Triggered when the user
  // clicks a row in the Reasoning path list — gives them a per-edge
  // version of the full "Trace on graph" animation.
  function focusStep(i: number) {
    if (running) return;
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    const step = displayPath[i];
    if (!step) return;

    setSelectedSourceId(null);
    cy.elements().removeClass("active-path glow seed");
    cy.elements().addClass("dim");

    const edge = cy
      .edges()
      .filter(
        (e) =>
          e.data("source") === step.from &&
          e.data("target") === step.to &&
          e.data("type") === step.edge
      );
    const fromNode = cy.getElementById(step.from);
    const toNode = cy.getElementById(step.to);

    edge.removeClass("dim").addClass("active-path");
    fromNode.removeClass("dim").addClass("glow");
    toNode.removeClass("dim").addClass("glow");

    setActiveStep(i);
    cy.animate(
      { fit: { eles: edge.union(fromNode).union(toNode), padding: 80 } },
      { duration: 350 }
    );
  }

  // Focus one citation node + its immediate edges in the retrieved
  // subgraph. Used by source-chip clicks so the right pane reveals
  // exactly which node a citation refers to.
  function focusNode(nodeId: string) {
    if (running) return;
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;

    cy.elements().removeClass("active-path glow seed");
    cy.elements().addClass("dim");

    const node = cy.getElementById(nodeId);
    if (!node || node.empty()) return;
    const connected = node.connectedEdges();

    node.removeClass("dim").addClass("glow");
    connected.removeClass("dim");
    connected.connectedNodes().removeClass("dim");

    setActiveStep(-1);
    cy.animate(
      {
        fit: {
          eles: node.union(connected).union(connected.connectedNodes()),
          padding: 90,
        },
      },
      { duration: 350 }
    );
  }

  return (
    <div className="flex h-screen w-screen bg-stone-50 text-stone-900">
      {/* LEFT: chat — given slightly more width than the inspector
          to keep the conversation the visual centre of gravity.
          Width is user-resizable via the draggable divider below.
          min-w-0 + overflow-hidden lets flex shrink this pane below
          its intrinsic content width (default min-width: auto). */}
      <div
        className="flex flex-col bg-white min-w-0 overflow-hidden"
        style={{ width: `${leftPanePct}%` }}
      >
        <header className="px-6 py-3.5 border-b border-stone-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <TaxxaMark />
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-stone-900">
                Taxxa
              </div>
              <div className="text-[11px] text-stone-500">
                Tax assistant · explainable retrieval
              </div>
            </div>
          </div>
          {/* Team attribution sits in the header between the Taxxa
              wordmark and the retrieval badges. Visible at-a-glance in
              every screenshot; the name doubles as a fitting tax-app
              disclaimer so we lean into the double-meaning. */}
          <div
            className="flex items-center gap-1.5 text-[11px] border border-stone-200 bg-stone-50/80 rounded-full px-2.5 py-1"
            title="Aaltoes Hackathon · Taxxa challenge"
          >
            <span className="text-[10px] uppercase tracking-wider text-stone-500">
              Team
            </span>
            <span className="font-medium text-stone-800">
              Not Legal Advice
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <RetrievalBadge
              state={retrievalState}
              method={data?.metrics.embeddingMethod ?? "local"}
              answerProvider={data?.metrics.answerProvider ?? "fallback"}
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-7">
          {/* Suggested prompts — compact pill row, not oversized cards. */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-2 font-medium">
              Try a question
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUERY_IDS.map((id) => {
                const q = QUERIES[id];
                const isActive = id === activeQueryId;
                return (
                  <button
                    key={id}
                    disabled={running || retrievalState === "loading"}
                    onClick={() => selectQuery(id)}
                    title={q.question}
                    className={`text-left rounded-full px-3 py-1.5 border text-[12px] transition-colors duration-150 ${
                      isActive
                        ? "border-amber-500/60 bg-amber-50 text-amber-900"
                        : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Empty state */}
          {!data && retrievalState === "idle" && (
            <div className="flex-1 flex items-center justify-center py-16">
              <div className="text-center max-w-sm">
                <div className="text-sm text-stone-700 mb-1.5">
                  Choose a question to begin.
                </div>
                <div className="text-[12px] text-stone-500 leading-relaxed">
                  Each answer is grounded in Finnish tax law, Vero guidance
                  and KHO case law. The reasoning behind every claim is
                  inspectable.
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {!data && retrievalState === "loading" && activeQueryId && (
            <div className="space-y-6">
              <QuestionHeader text={QUERIES[activeQueryId].question} />
              <div className="text-[12px] text-stone-500 flex items-center gap-2">
                <span className="inline-flex gap-1">
                  <span className="inline-block w-1 h-1 rounded-full bg-stone-400 animate-pulse" />
                  <span className="inline-block w-1 h-1 rounded-full bg-stone-400 animate-pulse [animation-delay:0.2s]" />
                  <span className="inline-block w-1 h-1 rounded-full bg-stone-400 animate-pulse [animation-delay:0.4s]" />
                </span>
                Retrieving subgraph
              </div>
            </div>
          )}

          {data && activeQueryId && (() => {
            const m = data.metrics;
            return (
              <div className="space-y-7">
                {/* User question — monospaced heading, no bubble. */}
                <QuestionHeader text={QUERIES[activeQueryId].question} />

                {/* Answer */}
                <section>
                  <SectionLabel>Answer</SectionLabel>
                  <div className="text-[14px] leading-7 text-stone-800">
                    {data.answer}
                  </div>
                </section>

                {/* Sources */}
                <section>
                  <SectionLabel>Sources</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {data.citations.map((c) => {
                      const isSelected = selectedSourceId === c.node_id;
                      return (
                        <button
                          key={c.node_id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSourceId(null);
                              resetView();
                            } else {
                              setSelectedSourceId(c.node_id);
                              focusNode(c.node_id);
                            }
                          }}
                          disabled={running}
                          title={c.snippet}
                          className={`group text-left rounded-md border px-2.5 py-1.5 text-[12px] transition-colors disabled:opacity-50 ${
                            isSelected
                              ? "border-amber-500/60 bg-amber-50"
                              : "border-stone-200 bg-white hover:border-amber-500/50 hover:bg-amber-50/40"
                          }`}
                        >
                          <span
                            className={
                              isSelected
                                ? "font-medium text-amber-900"
                                : "font-medium text-stone-900"
                            }
                          >
                            {c.label}
                          </span>
                          <span className="text-stone-500 ml-1.5 truncate inline-block max-w-[220px] align-bottom">
                            {c.snippet}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Inline source preview — shown when a citation is
                      selected. Lifts the full node text out of the graph
                      so the user sees exactly what's being cited without
                      leaving the answer view. Graph pane stays focused on
                      the same node, so the two surfaces stay synchronised. */}
                  {selectedSourceId &&
                    (() => {
                      const node = graph.nodes.find(
                        (n) => n.id === selectedSourceId
                      );
                      if (!node) return null;
                      const authority =
                        "authority" in node
                          ? (node as { authority: string }).authority
                          : "";
                      const type =
                        "type" in node
                          ? (node as { type: string }).type
                          : "";
                      return (
                        <div
                          ref={sourcePreviewRef}
                          className="mt-3 rounded-md border border-stone-200 bg-stone-50/60 p-3"
                        >
                          <div className="flex items-baseline justify-between mb-1.5">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-[11px] text-amber-800">
                                {node.id}
                              </span>
                              <span className="text-[12px] font-medium text-stone-900">
                                {node.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] uppercase tracking-wider text-stone-500 bg-white border border-stone-200 rounded px-1.5 py-0.5">
                                {type}
                              </span>
                              <span className="text-[10px] uppercase tracking-wider text-stone-500 bg-white border border-stone-200 rounded px-1.5 py-0.5">
                                {authority}
                              </span>
                              <button
                                onClick={() => {
                                  setSelectedSourceId(null);
                                  resetView();
                                }}
                                className="text-stone-400 hover:text-stone-700 text-sm leading-none px-1"
                                aria-label="Close source preview"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          <p className="text-[12px] text-stone-700 leading-6">
                            {node.text}
                          </p>
                          <div className="mt-2 text-[10px] text-stone-500">
                            Highlighted on the graph with its immediate
                            relationships.
                          </div>
                        </div>
                      );
                    })()}

                  <div className="text-[11px] text-stone-500 mt-2">
                    Click a source to open its excerpt and highlight it on
                    the graph. Use <em>Trace on graph</em> below to walk the
                    full reasoning path.
                  </div>
                </section>

                {/* Reasoning path */}
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <SectionLabel className="mb-0">Reasoning path</SectionLabel>
                    <div className="flex gap-1.5">
                      <button
                        onClick={animatePath}
                        disabled={running}
                        className="text-[11px] px-2.5 py-1 rounded-md border border-amber-500/50 text-amber-700 bg-white hover:bg-amber-50 disabled:opacity-50 transition-colors"
                      >
                        {running ? "Tracing…" : "Trace on graph"}
                      </button>
                      <button
                        onClick={resetView}
                        disabled={running}
                        className="text-[11px] px-2.5 py-1 rounded-md border border-stone-200 text-stone-600 bg-white hover:bg-stone-50 disabled:opacity-50 transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <ol className="space-y-1">
                    {displayPath.map((step, i) => {
                      const isActive = activeStep === i;
                      const isCompleted = activeStep > i;
                      const isFuture =
                        activeStep !== -1 && activeStep < i;
                      return (
                        <li
                          key={i}
                          onClick={() => focusStep(i)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              focusStep(i);
                            }
                          }}
                          title={
                            EDGE_DESCRIPTIONS[step.edge]
                              ? `${EDGE_DESCRIPTIONS[step.edge]} Click to focus this edge on the graph.`
                              : "Click to focus this edge on the graph."
                          }
                          className={`relative text-[12px] rounded-md pl-4 pr-3 py-2 border overflow-hidden transition-colors duration-200 cursor-pointer hover:border-amber-500/40 hover:bg-amber-50/40 ${
                            isActive
                              ? "border-amber-500/40 bg-amber-50/70"
                              : isCompleted
                              ? "border-stone-200 bg-white"
                              : isFuture
                              ? "border-stone-200 bg-white opacity-60"
                              : "border-stone-200 bg-white"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`absolute left-0 top-0 bottom-0 transition-all duration-200 ${
                              isActive
                                ? "w-[2px] bg-amber-500"
                                : isCompleted
                                ? "w-[2px] bg-amber-300"
                                : "w-0"
                            }`}
                          />
                          <span className="font-mono text-[10px] text-stone-400 mr-2">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="font-mono text-[11px] text-stone-800">
                            {step.from}
                          </span>
                          <span
                            title={
                              EDGE_DESCRIPTIONS[step.edge] ?? step.edge
                            }
                            className="mx-1.5 font-mono text-[10px] uppercase tracking-wider text-stone-500 underline decoration-dotted decoration-stone-300 underline-offset-2 cursor-help"
                          >
                            {step.edge.toLowerCase().replace(/_/g, " ")}
                          </span>
                          <span className="font-mono text-[11px] text-stone-800">
                            {step.to}
                          </span>
                          <div
                            className={`mt-0.5 ml-6 leading-relaxed text-[12px] ${
                              isActive
                                ? "text-stone-800"
                                : isFuture
                                ? "text-stone-400"
                                : "text-stone-600"
                            }`}
                          >
                            {step.rationale}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {data.fullPath.length > data.path.length && (
                    <div className="mt-2 flex items-center justify-between text-[10px] text-stone-500">
                      <span>
                        {showFullPath
                          ? `Showing all ${data.fullPath.length} retrieved hops`
                          : `Showing ${data.path.length} of ${data.fullPath.length} retrieved hops — curated for clarity`}
                      </span>
                      <button
                        onClick={() => {
                          setActiveStep(-1);
                          setShowFullPath((v) => !v);
                        }}
                        disabled={running}
                        className="text-stone-500 hover:text-stone-700 underline underline-offset-2 disabled:opacity-50"
                      >
                        {showFullPath ? "show curated" : "show all (dev)"}
                      </button>
                    </div>
                  )}
                </section>

                {/* Retrieval inspector — quieter, no card-vs-card competition.
                    Reads as a small "advanced" footer of the answer, not as
                    benchmark theatre. */}
                <section>
                  <details className="group">
                    <summary className="cursor-pointer list-none flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-stone-500 font-medium hover:text-stone-700">
                      <span className="inline-block w-3 text-stone-400 group-open:rotate-90 transition-transform">
                        ›
                      </span>
                      Retrieval inspector
                      <span className="font-mono normal-case tracking-normal text-[11px] text-stone-400 ml-1">
                        graph {m.graphTokens} · flat {m.flatTokens} · approx.
                      </span>
                    </summary>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-md border border-stone-200 bg-white p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[12px] font-medium text-stone-800">
                            Flat retrieval
                          </div>
                          <span className="text-[10px] uppercase tracking-wider text-stone-500 bg-stone-100 border border-stone-200 rounded px-1.5 py-0.5">
                            Broad context
                          </span>
                        </div>
                        <div className="flex items-baseline gap-4 mb-2">
                          <Stat
                            value={m.flatTokens}
                            label="approx. tokens"
                          />
                          <Stat
                            value={data.flatChunks.length}
                            label="chunks"
                          />
                        </div>
                        <p className="text-[11px] text-stone-500 leading-relaxed">
                          Top-k passages by semantic similarity, including
                          adjacent text from the same source.
                        </p>
                        <button
                          onClick={() => {
                            // Mutually exclusive with the graph context
                            // panel — opening one collapses the other so
                            // the inspector never stacks both at once.
                            setShowFlatContext((v) => !v);
                            setShowGraphContext(false);
                          }}
                          className="mt-2 text-[11px] text-stone-600 hover:text-stone-900 underline underline-offset-2"
                        >
                          {showFlatContext ? "Hide context" : "View context"}
                        </button>
                      </div>

                      <div className="rounded-md border border-stone-200 bg-white p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[12px] font-medium text-stone-800">
                            Graph-aware retrieval
                          </div>
                          <span className="text-[10px] uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            Structured context
                          </span>
                        </div>
                        <div className="flex items-baseline gap-4 mb-2">
                          <Stat value={m.graphTokens} label="approx. tokens" />
                          <Stat value={m.graphNodeCount} label="nodes" />
                          <Stat
                            value={m.graphEdgeCount}
                            label="typed edges"
                            tooltip="Typed legal relationships between nodes: EXCEPTION_TO, USES_DEFINITION, INTERPRETS, RULED_ON, IMPLEMENTS, CITES. Hover any edge label in the reasoning path for its meaning."
                          />
                        </div>
                        <p className="text-[11px] text-stone-500 leading-relaxed">
                          Subgraph reached by typed traversal from seed nodes.
                          Preserves authority and cross-reference structure.
                        </p>
                        <button
                          onClick={() => {
                            setShowGraphContext((v) => !v);
                            setShowFlatContext(false);
                          }}
                          className="mt-2 text-[11px] text-stone-600 hover:text-stone-900 underline underline-offset-2"
                        >
                          {showGraphContext ? "Hide context" : "View context"}
                        </button>
                      </div>
                    </div>

                    <p className="mt-2 text-[11px] text-stone-500 leading-relaxed">
                      Graph context may not always be smaller, but it is
                      structured: nodes, authority, and typed relationships.
                      Token counts are approximate.
                    </p>

                    {showFlatContext && (
                      <div className="mt-3 rounded-md border border-stone-200 bg-stone-50/60 p-3">
                        <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">
                          Flat retrieval · {data.flatChunks.length} chunks
                        </div>
                        <div className="space-y-2">
                          {data.flatChunks.map((c, i) => (
                            <div
                              key={c.id}
                              className="rounded-md border border-stone-200 bg-white px-3 py-2"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-mono text-stone-400">
                                  chunk {i + 1}
                                </span>
                                <span className="text-[10px] text-stone-500">
                                  {c.source}
                                </span>
                              </div>
                              <p className="text-[11px] text-stone-700 italic leading-relaxed">
                                {c.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {showGraphContext && (
                      <div className="mt-3 rounded-md border border-stone-200 bg-stone-50/60 p-3">
                        <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">
                          Graph-aware retrieval · {m.graphNodeCount} nodes,
                          grouped by authority
                        </div>
                        <div className="space-y-3">
                          {nodesByAuthority.map((group) => (
                            <div key={group.key}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">
                                  {group.label}
                                </span>
                                <span className="text-[10px] text-stone-500">
                                  · {group.nodes.length}{" "}
                                  {group.nodes.length === 1 ? "node" : "nodes"}
                                </span>
                                <div className="flex-1 h-px bg-stone-200" />
                              </div>
                              <div className="space-y-1.5">
                                {group.nodes.map((n) => (
                                  <div
                                    key={n.id}
                                    className="rounded-md border border-stone-200 bg-white px-3 py-2"
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[11px] font-mono text-amber-800">
                                        {n.id}
                                      </span>
                                      <span className="text-[11px] text-stone-700">
                                        {n.label}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-stone-600 italic leading-relaxed">
                                      {n.text}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="text-[10px] text-stone-500 italic pt-1 border-t border-stone-200">
                            + {m.graphEdgeCount} typed edges:{" "}
                            {subgraphEdgeTypes
                              .map((t) => t.toLowerCase().replace(/_/g, " "))
                              .join(", ")}
                          </div>
                        </div>
                      </div>
                    )}
                  </details>
                </section>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Draggable divider. 6-px-wide column with a 1-px rule centred
          inside it for the visible seam. The drag uses pointer events
          + setPointerCapture so the divider element receives every
          pointermove / pointerup until release — nothing on the right
          (cytoscape canvas, scrollbar, anything) can steal the drag. */}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={onDividerPointerDown}
        onPointerMove={onDividerPointerMove}
        onPointerUp={onDividerPointerUp}
        onPointerCancel={onDividerPointerUp}
        title="Drag to resize"
        className="group relative w-1.5 shrink-0 bg-transparent hover:bg-amber-500/10 cursor-col-resize transition-colors touch-none"
      >
        <div
          aria-hidden
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-stone-200 group-hover:bg-amber-500/60 transition-colors"
        />
      </div>

      {/* RIGHT: Why this answer — explainability inspector pane.
          Visually subordinate to the chat: same background tone, no
          competing header chrome. min-w-0 + overflow-hidden are the
          flexbox fix that lets this pane shrink past the cytoscape
          canvas's natural pixel width — without them, the canvas's
          intrinsic size pins the divider in place. */}
      <div className="flex flex-col flex-1 bg-stone-50 min-w-0 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between bg-white">
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 font-medium">
              Why this answer
            </div>
            <div className="text-[13px] font-medium text-stone-800">
              {data ? "Retrieved subgraph" : "Awaiting question"}
            </div>
          </div>
          {data && (
            <div
              className="text-[10px] text-stone-500 font-mono"
              title="Approximate token counts — same character heuristic applied to the serialized prompt context for each method"
            >
              <span className="text-stone-700">
                {data.metrics.graphTokens}
              </span>
              <span className="text-stone-400 ml-1">graph</span>
              <span className="text-stone-300 mx-1.5">·</span>
              <span className="text-stone-600">
                {data.metrics.flatTokens}
              </span>
              <span className="text-stone-400 ml-1">flat</span>
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          {data ? (
            <Canvas graph={focusedGraph as never} onReady={handleReady} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-xs px-6">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full border border-dashed border-stone-300 flex items-center justify-center text-stone-400">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="6" cy="6" r="2" />
                    <circle cx="18" cy="6" r="2" />
                    <circle cx="12" cy="18" r="2" />
                    <line x1="8" y1="7" x2="11" y2="16" />
                    <line x1="16" y1="7" x2="13" y2="16" />
                  </svg>
                </div>
                <div className="text-[12px] text-stone-600">
                  {retrievalState === "loading"
                    ? "Retrieving subgraph"
                    : "Choose a question to see the retrieved subgraph."}
                </div>
                {retrievalState === "idle" && (
                  <div className="text-[11px] text-stone-500 mt-2 leading-relaxed">
                    The knowledge graph has {totalVisibleNodes} typed nodes.
                    Each question retrieves a focused subgraph from it.
                  </div>
                )}
              </div>
            </div>
          )}

          {data && (
            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur border border-stone-200 rounded-md px-2.5 py-1 text-[10px] shadow-sm">
              <span className="font-mono text-stone-800">
                {data.metrics.graphNodeCount}
              </span>
              <span className="text-stone-500 ml-1">nodes</span>
              <span className="text-stone-300 mx-1.5">·</span>
              <span className="font-mono text-stone-800">
                {data.metrics.graphEdgeCount}
              </span>
              <span className="text-stone-500 ml-1">edges</span>
              <span className="text-stone-400 ml-2">
                of {totalVisibleNodes}
              </span>
            </div>
          )}

          <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur border border-stone-200 rounded-md px-3 py-2 text-[10px] shadow-sm flex gap-4">
            <div className="space-y-1">
              <div className="text-stone-500 uppercase tracking-[0.14em] mb-1 font-medium">
                Node types
              </div>
              <LegendDot color="#3b82f6" label="Section (law)" />
              <LegendDot color="#8b5cf6" label="Definition" />
              <LegendDot color="#059669" label="Vero guidance" />
              <LegendDot color="#d97706" label="KHO decision" />
              <LegendDot color="#64748b" label="EU directive" />
            </div>
            <div className="space-y-1 border-l border-stone-200 pl-4 min-w-[150px]">
              <div className="text-stone-500 uppercase tracking-[0.14em] mb-1 font-medium">
                Edge types
              </div>
              {EDGE_LEGEND.map((e) => (
                <LegendEdge
                  key={e.type}
                  color={e.color}
                  style={e.style}
                  label={e.type.toLowerCase().replace(/_/g, " ")}
                  tooltip={EDGE_DESCRIPTIONS[e.type]}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <PresenterFAQ />
    </div>
  );
}

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-2 font-medium ${className}`}
    >
      {children}
    </div>
  );
}

function Stat({
  value,
  label,
  tooltip,
}: {
  value: number;
  label: string;
  tooltip?: string;
}) {
  return (
    <div title={tooltip} className={tooltip ? "cursor-help" : undefined}>
      <div className="text-[18px] font-semibold text-stone-900 tabular-nums">
        {value}
      </div>
      <div
        className={`text-[10px] text-stone-500 uppercase tracking-wider ${
          tooltip
            ? "underline decoration-dotted decoration-stone-300 underline-offset-2"
            : ""
        }`}
      >
        {label}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-stone-700">
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}

function LegendEdge({
  color,
  style,
  label,
  tooltip,
}: {
  color: string;
  style: string;
  label: string;
  tooltip?: string;
}) {
  return (
    <div
      className="flex items-center gap-2 text-stone-700 cursor-help"
      title={tooltip}
    >
      <span
        aria-hidden
        className="w-5 h-0 inline-block"
        style={{
          borderTopWidth: 1.5,
          borderTopStyle: (style as "solid" | "dashed" | "dotted") ?? "solid",
          borderTopColor: color,
        }}
      />
      <span className="lowercase">{label}</span>
    </div>
  );
}

function TaxxaMark() {
  // Small geometric mark — inspired by Taxxa's star glyph but distinct
  // (four-point sparkle in amber). Stays in product family without
  // copying the logo.
  return (
    <span className="inline-flex w-7 h-7 rounded-md bg-amber-500 items-center justify-center text-white">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
      </svg>
    </span>
  );
}

function RetrievalBadge({
  state,
  method,
  answerProvider,
}: {
  state: "idle" | "loading" | "live" | "fallback";
  method: "voyage" | "openai" | "local";
  answerProvider: "sonnet" | "fallback";
}) {
  if (state === "idle") {
    return (
      <span className="text-[10px] uppercase tracking-wider text-stone-500 bg-white border border-stone-200 rounded-full px-2 py-0.5">
        Ready
      </span>
    );
  }
  if (state === "loading") {
    return (
      <span className="text-[10px] uppercase tracking-wider text-stone-500 bg-white border border-stone-200 rounded-full px-2 py-0.5">
        Retrieving
      </span>
    );
  }
  if (state === "live") {
    return (
      <span className="flex items-center gap-1.5">
        <span
          title={`Embeddings: ${method}`}
          className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex items-center gap-1.5"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          embed · {method}
        </span>
        <span
          title={`Answer: ${answerProvider}`}
          className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border ${
            answerProvider === "sonnet"
              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
              : "text-stone-500 bg-white border-stone-200"
          }`}
        >
          answer · {answerProvider}
        </span>
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      Cached fallback
    </span>
  );
}

function QuestionHeader({ text }: { text: string }) {
  // Render the user question Taxxa-style: a monospaced heading at the
  // top of the answer block, separated by a thin rule — not a chat
  // bubble. Calmer and more professional.
  return (
    <div className="pb-4 border-b border-stone-200">
      <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-2 font-medium">
        Question
      </div>
      <p className="font-mono text-[13px] leading-6 text-stone-800">{text}</p>
    </div>
  );
}
