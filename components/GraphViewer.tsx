"use client";

import { useMemo, useCallback, useRef } from "react";
import { toPng, toSvg } from "html-to-image";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  Handle,
  Position,
  NodeProps,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";

// ── Types ────────────────────────────────────────────────────

interface RawNode {
  id: string;
  type: string;
  name: string;
  path: string;
}

interface RawEdge {
  id: string;
  from: string;
  to: string;
  type: string;
}

interface GraphViewerProps {
  graph: {
    nodes: RawNode[];
    edges: RawEdge[];
    stats: {
      nodeCount: number;
      edgeCount: number;
      fileCount: number;
      functionCount: number;
      classCount: number;
    };
  };
  highlightedNodeIds?: string[];
}

interface GraphCanvasProps extends GraphViewerProps {
  highlightedNodeIds?: string[];
}

interface NodeData {
  label: string;
  fullPath: string;
  highlighted?: boolean;
}

// ── Constants ────────────────────────────────────────────────

const MONO = "var(--font-geist-mono, 'JetBrains Mono', 'Fira Mono', monospace)";
const GAP_Y = 108;
const COL_W = 280;
const FUNC_COL_W = 200;
const FUNC_COLS = 3;

// ── Helpers ──────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  if (str.includes("/")) {
    const parts = str.split("/");
    const filename = parts[parts.length - 1];
    if (filename.length <= max - 4) return ".../" + filename;
  }
  return str.slice(0, max - 3) + "…";
}

// ── Layout algorithm ─────────────────────────────────────────

function computePositions(rawNodes: RawNode[]): Record<string, { x: number; y: number }> {
  const modules = rawNodes.filter((n) => n.type === "module");
  const files = rawNodes.filter((n) => n.type === "file");
  const funcs = rawNodes.filter((n) => n.type === "function" || n.type === "class");

  const positions: Record<string, { x: number; y: number }> = {};

  function centerColumn(arr: RawNode[], x: number) {
    const startY = -(arr.length * GAP_Y) / 2;
    arr.forEach((node, i) => {
      positions[node.id] = { x, y: startY + i * GAP_Y };
    });
  }

  let fileColX = 0;
  if (modules.length > 0) {
    centerColumn(modules, 0);
    fileColX = COL_W;
  }

  centerColumn(files, fileColX);

  const funcColStartX = fileColX + (files.length > 0 ? COL_W : 0);
  const totalRows = Math.ceil(funcs.length / FUNC_COLS);
  const startY = -(totalRows * GAP_Y) / 2;

  funcs.forEach((node, i) => {
    const col = i % FUNC_COLS;
    const row = Math.floor(i / FUNC_COLS);
    positions[node.id] = {
      x: funcColStartX + col * FUNC_COL_W,
      y: startY + row * GAP_Y,
    };
  });

  return positions;
}

// ── Custom Node: File ────────────────────────────────────────

function FileNode({ data }: NodeProps<NodeData>) {
  const hl = data.highlighted;
  const border = hl ? "#ef4444" : "#3b82f6";
  const glow  = hl ? "rgba(239,68,68,0.55)" : "rgba(59,130,246,0.50)";
  const text  = hl ? "#fca5a5" : "#93c5fd";
  const icon  = hl ? "#ef4444" : "#60a5fa";
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: border, border: "none", width: 7, height: 7 }} />
      <div title={data.fullPath} style={{ background: "linear-gradient(140deg, #0c1a2e 0%, #0a1525 100%)", border: `1.5px solid ${border}`, borderRadius: "9px", padding: "9px 13px", filter: `drop-shadow(0 0 8px ${glow})`, fontFamily: MONO, minWidth: "185px", maxWidth: "230px", cursor: "default", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 700, color: text, letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {truncate(data.label, 22)}
          </span>
        </div>
        <div style={{ fontSize: "9px", color: hl ? "#7f1d1d" : "#334155", marginTop: "4px", letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {truncate(data.fullPath, 32)}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: border, border: "none", width: 7, height: 7 }} />
    </>
  );
}

// ── Custom Node: Directory / Module ──────────────────────────

function ModuleNode({ data }: NodeProps<NodeData>) {
  const hl     = data.highlighted;
  const border = hl ? "#ef4444" : "#334155";
  const glow   = hl ? "rgba(239,68,68,0.4)" : "none";
  const text   = hl ? "#fca5a5" : "#94a3b8";
  const icon   = hl ? "#ef4444" : "#64748b";
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: hl ? "#ef4444" : "#475569", border: "none", width: 7, height: 7 }} />
      <div title={data.fullPath} style={{ background: "linear-gradient(140deg, #0d1117 0%, #0b0f17 100%)", border: `1.5px solid ${border}`, borderRadius: "9px", padding: "9px 13px", filter: hl ? `drop-shadow(0 0 7px ${glow})` : "none", fontFamily: MONO, minWidth: "150px", maxWidth: "200px", cursor: "default", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={icon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 700, color: text, letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {truncate(data.label, 20)}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: hl ? "#ef4444" : "#475569", border: "none", width: 7, height: 7 }} />
    </>
  );
}

// ── Custom Node: Function ────────────────────────────────────

function FunctionNode({ data }: NodeProps<NodeData>) {
  const hl     = data.highlighted;
  const border = hl ? "#ef4444" : "#7c3aed";
  const glow   = hl ? "rgba(239,68,68,0.50)" : "rgba(168,85,247,0.42)";
  const text   = hl ? "#fca5a5" : "#c4b5fd";
  const badge  = hl ? "#ef4444" : "#a855f7";
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: hl ? "#ef4444" : "#a855f7", border: "none", width: 6, height: 6 }} />
      <div title={data.fullPath} style={{ background: "linear-gradient(140deg, #1a0b2e 0%, #130920 100%)", border: `1px solid ${border}`, borderRadius: "7px", padding: "7px 11px", filter: `drop-shadow(0 0 6px ${glow})`, fontFamily: MONO, minWidth: "145px", maxWidth: "185px", cursor: "default", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "8px", fontWeight: 800, color: badge, letterSpacing: "0.08em", textTransform: "uppercase" }}>fn</span>
          <span style={{ fontSize: "10.5px", fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {truncate(data.label, 20)}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: hl ? "#ef4444" : "#a855f7", border: "none", width: 6, height: 6 }} />
    </>
  );
}

// ── Custom Node: Class ───────────────────────────────────────

function ClassNode({ data }: NodeProps<NodeData>) {
  const hl     = data.highlighted;
  const border = hl ? "#ef4444" : "#b45309";
  const glow   = hl ? "rgba(239,68,68,0.48)" : "rgba(245,158,11,0.38)";
  const text   = hl ? "#fca5a5" : "#fcd34d";
  const badge  = hl ? "#ef4444" : "#f59e0b";
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: hl ? "#ef4444" : "#f59e0b", border: "none", width: 6, height: 6 }} />
      <div title={data.fullPath} style={{ background: "linear-gradient(140deg, #1c1200 0%, #160e00 100%)", border: `1px solid ${border}`, borderRadius: "7px", padding: "7px 11px", filter: `drop-shadow(0 0 5px ${glow})`, fontFamily: MONO, minWidth: "145px", maxWidth: "185px", cursor: "default", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "8px", fontWeight: 800, color: badge, letterSpacing: "0.08em", textTransform: "uppercase" }}>cl</span>
          <span style={{ fontSize: "10.5px", fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {truncate(data.label, 20)}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: hl ? "#ef4444" : "#f59e0b", border: "none", width: 6, height: 6 }} />
    </>
  );
}

// Node types must be defined outside the render tree for React Flow performance
const NODE_TYPES = {
  fileNode: FileNode,
  moduleNode: ModuleNode,
  functionNode: FunctionNode,
  classNode: ClassNode,
};

// ── Edge factory ─────────────────────────────────────────────

function makeEdgeColor(type: string): string {
  if (type === "imports") return "#3b82f6";
  if (type === "calls") return "#a855f7";
  if (type === "defines") return "#f59e0b";
  return "#334155";
}

// ── Inner canvas (needs ReactFlowProvider) ───────────────────

function GraphCanvas({ graph, highlightedNodeIds }: GraphCanvasProps) {
  const { fitView } = useReactFlow();
  const graphRef = useRef<HTMLDivElement>(null);
  const highlightSet = useMemo(
    () => new Set(highlightedNodeIds ?? []),
    [highlightedNodeIds]
  );

  async function handleDownload(format: "png" | "svg") {
    if (!graphRef.current) return;
    try {
      const opts = { pixelRatio: 2, backgroundColor: "#030712" };
      const dataUrl = format === "png"
        ? await toPng(graphRef.current, opts)
        : await toSvg(graphRef.current, { backgroundColor: "#030712" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `codebase-graph.${format}`;
      a.click();
    } catch (err) {
      console.error("[GraphViewer] Export failed:", err);
    }
  }

  const flowNodes: Node[] = useMemo(() => {
    const positions = computePositions(graph.nodes);
    return graph.nodes.map((node) => {
      const type =
        node.type === "module" ? "moduleNode"
        : node.type === "file" ? "fileNode"
        : node.type === "function" ? "functionNode"
        : "classNode";

      const pos = positions[node.id] ?? { x: 0, y: 0 };
      const filename = node.name.split("/").pop() || node.name;

      return {
        id: node.id,
        type,
        position: pos,
        data: { label: filename, fullPath: node.path, highlighted: highlightSet.has(node.id) },
      };
    });
  }, [graph.nodes, highlightSet]);

  const flowEdges: Edge[] = useMemo(() => {
    return graph.edges
      .filter((e) => e.from && e.to && e.from !== e.to)
      .map((edge) => {
        const color = makeEdgeColor(edge.type);
        return {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          type: "bezier",
          style: { stroke: color, strokeWidth: 1.5, opacity: 0.55 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 14,
            height: 14,
          },
        } as Edge;
      });
  }, [graph.edges]);

  const [nodes, , onNodesChange] = useNodesState(flowNodes);
  const [edges, , onEdgesChange] = useEdgesState(flowEdges);

  const onInit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.18, duration: 500 }), 80);
  }, [fitView]);

  return (
    <div ref={graphRef} className="h-full w-full" style={{ background: "#030712" }}>
      {/* Legend header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid #1e2736",
          background: "#050d1a",
        }}
      >
        <div style={{ display: "flex", gap: "18px", alignItems: "center" }}>
          <LegendDot color="#3b82f6" label="File" />
          <LegendDot color="#64748b" label="Directory" />
          <LegendDot color="#a855f7" label="Function" />
          <LegendDot color="#f59e0b" label="Class" />
          {highlightedNodeIds && highlightedNodeIds.length > 0 && (
            <LegendDot color="#ef4444" label={`Affected (${highlightedNodeIds.length})`} />
          )}
        </div>
        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          <EdgeLegend color="#3b82f6" label="imports" />
          <EdgeLegend color="#a855f7" label="calls" />
          <EdgeLegend color="#f59e0b" label="defines" />
          {/* Download Graph */}
          <div style={{ display: "flex", gap: "6px", marginLeft: "8px" }}>
            <button
              onClick={() => handleDownload("png")}
              title="Download as PNG"
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 8px", background: "transparent", border: "1px solid #1e2736", borderRadius: "5px", color: "#475569", fontSize: "10px", fontFamily: MONO, cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3b82f6"; (e.currentTarget as HTMLButtonElement).style.color = "#93c5fd"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e2736"; (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              PNG
            </button>
            <button
              onClick={() => handleDownload("svg")}
              title="Download as SVG"
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 8px", background: "transparent", border: "1px solid #1e2736", borderRadius: "5px", color: "#475569", fontSize: "10px", fontFamily: MONO, cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3b82f6"; (e.currentTarget as HTMLButtonElement).style.color = "#93c5fd"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1e2736"; (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              SVG
            </button>
          </div>
        </div>
      </div>

      {/* ReactFlow canvas */}
      <div style={{ height: "calc(100% - 41px)" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onInit={onInit}
          fitView
          minZoom={0.15}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          style={{ background: "#030712" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="#1e2736"
            gap={22}
            size={1.2}
          />
          <Controls
            style={{
              background: "#050d1a",
              border: "1px solid #1e2736",
              borderRadius: "8px",
              boxShadow: "none",
            }}
          />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === "fileNode") return "#3b82f6";
              if (n.type === "moduleNode") return "#475569";
              if (n.type === "functionNode") return "#a855f7";
              if (n.type === "classNode") return "#f59e0b";
              return "#334155";
            }}
            style={{
              background: "#050d1a",
              border: "1px solid #1e2736",
              borderRadius: "8px",
            }}
            maskColor="rgba(3,7,18,0.75)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

// ── Legend helpers ────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 4px ${color}80` }} />
      <span style={{ fontSize: "10px", color: "#475569", fontFamily: MONO }}>
        {label}
      </span>
    </div>
  );
}

function EdgeLegend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      <div style={{ width: 16, height: 1.5, background: color, opacity: 0.7 }} />
      <span style={{ fontSize: "10px", color: "#475569", fontFamily: MONO }}>
        {label}
      </span>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────

function EmptyGraphState() {
  return (
    <div
      className="h-full w-full flex items-center justify-center"
      style={{ background: "#030712" }}
    >
      <div className="text-center">
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            border: "1px solid #1e2736",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p style={{ fontSize: "13px", color: "#475569", marginBottom: "6px", fontFamily: MONO }}>
          No graph nodes detected
        </p>
        <p style={{ fontSize: "11px", color: "#1e293b", maxWidth: "260px", lineHeight: "1.6" }}>
          The code graph may still be building, or no analyzable functions were found in the uploaded files.
        </p>
      </div>
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────

export default function GraphViewer({ graph, highlightedNodeIds }: GraphViewerProps) {
  if (!graph.nodes || graph.nodes.length === 0) {
    return <EmptyGraphState />;
  }

  return (
    <ReactFlowProvider>
      <GraphCanvas graph={graph} highlightedNodeIds={highlightedNodeIds} />
    </ReactFlowProvider>
  );
}
