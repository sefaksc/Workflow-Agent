import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "reactflow";
import { NODE_TYPES } from "../flow/nodeTypes";
import type { CanvasNodeData } from "../types";

interface CanvasProps {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onSelectionChange: (params: OnSelectionChangeParams) => void;
  onInit?: (instance: ReactFlowInstance) => void;
  theme: "dark" | "light";
}

function Canvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  onInit,
  theme,
}: CanvasProps): JSX.Element {
  const backgroundColor = theme === "dark" ? "#334155" : "#dbeafe";
  const minimapMask = theme === "dark" ? "rgba(15, 23, 42, 0.45)" : "rgba(226, 232, 240, 0.6)";
  const minimapNodeColor = theme === "dark" ? "#1f2937" : "#cbd5f5";
  const minimapStroke = theme === "dark" ? "#60a5fa" : "#2563eb";

  return (
    <div className={`canvas-panel theme-${theme}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        fitView
        nodeTypes={NODE_TYPES}
        panOnScroll
        selectionOnDrag
        onInit={onInit}
        proOptions={{ hideAttribution: true }}
        className="canvas-surface"
      >
        <MiniMap
          pannable
          zoomable
          nodeColor={() => minimapNodeColor}
          nodeStrokeColor={minimapStroke}
          maskColor={minimapMask}
        />
        <Controls />
        <Background color={backgroundColor} gap={18} />
      </ReactFlow>
    </div>
  );
}

export default Canvas;
