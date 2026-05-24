"use client";

import { useEffect, useRef } from "react";
import cytoscape, { Core, ElementDefinition } from "cytoscape";

type Node = {
  id: string;
  type: string;
  label: string;
  text: string;
  authority: string;
  position: { x: number; y: number };
};

type Edge = {
  id: string;
  source: string;
  target: string;
  type: string;
};

type Graph = { nodes: Node[]; edges: Edge[] };

// Calmer node fills tuned for a light canvas. The hues are the same
// authority families as before (blue=law, purple=definition, green=
// guidance, amber=case, slate=directive) but pulled toward the muted
// end so the canvas reads as a diagram, not a neon graph viz.
const NODE_COLORS: Record<string, string> = {
  Law: "#1e40af",
  Section: "#3b82f6",
  Definition: "#8b5cf6",
  VeroGuidance: "#059669",
  KHO_Decision: "#d97706",
  EUDirective: "#64748b",
  Form: "#475569",
  Amendment: "#dc2626",
};

const EDGE_COLORS: Record<string, string> = {
  CONTAINS: "#94a3b8",
  EXCEPTION_TO: "#ea580c",
  CITES: "#94a3b8",
  USES_DEFINITION: "#a78bfa",
  INTERPRETS: "#10b981",
  RULED_ON: "#0e7490",
  IMPLEMENTS: "#94a3b8",
  AMENDS: "#facc15",
  SUPERSEDES: "#22c55e",
  APPLIES_TO_FORM: "#cbd5e1",
};

const EDGE_STYLES: Record<string, "solid" | "dashed" | "dotted"> = {
  CONTAINS: "solid",
  EXCEPTION_TO: "solid", // orange solid — a strong carve-out
  CITES: "dashed", // muted slate dashed — a soft cross-reference
  USES_DEFINITION: "dotted", // purple dotted — a definitional dependency
  INTERPRETS: "dashed", // green dashed — interpretive guidance
  RULED_ON: "solid", // amber solid — a court application
  IMPLEMENTS: "solid", // slate solid — a clean implementation arrow
  AMENDS: "solid",
  SUPERSEDES: "solid",
  APPLIES_TO_FORM: "dotted",
};

export default function Canvas({
  graph,
  onReady,
}: {
  graph: Graph;
  onReady?: (cy: Core) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const elements: ElementDefinition[] = [
      ...graph.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
          text: n.text,
          authority: n.authority,
        },
        position: { x: n.position.x, y: n.position.y },
      })),
      ...graph.edges.map((e) => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          label: e.type.replace(/_/g, " ").toLowerCase(),
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": (ele: cytoscape.NodeSingular) =>
              NODE_COLORS[ele.data("type")] ?? "#94a3b8",
            label: "data(label)",
            color: "#ffffff",
            "font-size": 14,
            "font-weight": 600,
            "text-valign": "center",
            "text-halign": "center",
            "text-outline-color": "#1f2937",
            "text-outline-width": 1.5,
            "text-wrap": "wrap",
            "text-max-width": "130",
            width: 70,
            height: 70,
            "border-width": 1,
            "border-color": "#e7e5e4",
          },
        },
        {
          // Base edge: relationship is communicated by colour + line-style,
          // NOT by text. Labels are suppressed (text-opacity 0) to keep the
          // canvas legible — viewers read the relationship from styling and
          // get full wording in the reasoning panel.
          selector: "edge",
          style: {
            "curve-style": "bezier",
            "line-color": (ele: cytoscape.EdgeSingular) =>
              EDGE_COLORS[ele.data("type")] ?? "#888",
            "line-style": (ele: cytoscape.EdgeSingular) =>
              EDGE_STYLES[ele.data("type")] ?? "solid",
            "target-arrow-color": (ele: cytoscape.EdgeSingular) =>
              EDGE_COLORS[ele.data("type")] ?? "#888",
            "target-arrow-shape": "triangle",
            "arrow-scale": 1.1,
            width: 1.8,
            label: "data(label)",
            "text-opacity": 0,
            "font-size": 13,
            "font-weight": 600,
            color: "#1f2937",
            "text-rotation": "autorotate",
            "text-background-color": "#ffffff",
            "text-background-opacity": 1,
            "text-background-padding": "4",
            "text-background-shape": "roundrectangle",
          },
        },
        {
          // Active reasoning edge: a restrained amber, slimmer than the
          // old neon highlight. Semantics still travel through colour
          // and the arrow direction; the chat-side reasoning row carries
          // the actual wording so viewers don't have to read off canvas.
          selector: ".active-path",
          style: {
            "line-color": "#d97706",
            "target-arrow-color": "#d97706",
            "arrow-scale": 1.3,
            width: 4,
            "z-index": 999,
            "transition-property": "line-color, width",
            "transition-duration": 300,
          },
        },
        {
          // Active node: thin amber border + very soft halo. Calmer than
          // the prior glow; the type fill colour stays readable.
          selector: ".glow",
          style: {
            "border-color": "#d97706",
            "border-width": 2,
            "overlay-color": "#f59e0b",
            "overlay-opacity": 0.06,
            "overlay-padding": 6,
            "overlay-shape": "ellipse",
            "font-size": 15,
            "font-weight": 700,
            width: 76,
            height: 76,
            "z-index": 900,
            "transition-property":
              "border-color, border-width, overlay-opacity, width, height, font-size",
            "transition-duration": 300,
          },
        },
        {
          selector: ".seed",
          style: {
            "border-color": "#d97706",
            "border-width": 3,
          },
        },
        {
          // Dim layer for retrieved-but-inactive elements. Slightly
          // softer than before so the canvas reads as quiet rather than
          // strongly faded.
          selector: ".dim",
          style: {
            opacity: 0.35,
          },
        },
        {
          // Node labels stay readable when dimmed (45 %) so retrieved
          // context remains identifiable from a glance. Edge labels stay
          // hidden because their base text-opacity is 0.
          selector: "node.dim",
          style: {
            "text-opacity": 0.5,
          },
        },
      ],
      layout: { name: "preset" },
      wheelSensitivity: 0.2,
      minZoom: 0.5,
      maxZoom: 2.5,
    });

    cyRef.current = cy;
    onReady?.(cy);

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph, onReady]);

  return <div ref={containerRef} className="w-full h-full bg-stone-50" />;
}
