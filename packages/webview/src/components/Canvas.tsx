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
}

function Canvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
}: CanvasProps): JSX.Element {
  return (
    <div className="canvas-panel">
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
      >
        <MiniMap pannable zoomable />
        <Controls />
        <Background color="#334155" gap={16} />
      </ReactFlow>
    </div>
  );
}

export default Canvas;
