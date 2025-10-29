import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  ReactFlowProvider,
  type OnSelectionChangeParams,
} from "reactflow";
import { nanoid } from "nanoid";
import Canvas from "./components/Canvas";
import PropertiesPanel from "./components/PropertiesPanel";
import YamlPanel from "./components/YamlPanel";
import {
  DEFAULT_RULES,
  parseWorkflowYaml,
  serializeWorkflow,
} from "./yaml";
import type {
  CanvasNodeData,
  CanvasNodeSnapshot,
  LoginApiProps,
  LoginFormProps,
  WorkflowNodeModel,
  WorkflowNodeType,
  WorkflowEdgeModel,
} from "./types";
import "./styles.css";
import "reactflow/dist/style.css";

type FlowNode = Node<CanvasNodeData>;
type FlowEdge = Edge<undefined>;
type FlowNodeChange = NodeChange<CanvasNodeData>;
type FlowEdgeChange = EdgeChange<undefined>;
type FlowConnection = Connection<CanvasNodeData, undefined>;
type FlowSelectionParams = OnSelectionChangeParams<CanvasNodeData, undefined>;


const INITIAL_NODES: FlowNode[] = [
  {
    id: "LoginForm1",
    type: "LoginFormComponent",
    position: { x: 200, y: 180 },
    data: {
      nodeType: "LoginFormComponent",
      label: "Login Form",
      props: {
        fields: [
          { name: "username", type: "string", required: true },
          { name: "password", type: "password", required: true },
        ],
        ui: {
          styleLibrary: "MaterialUI",
          validation: "basic",
        },
      } satisfies LoginFormProps,
    },
  },
  {
    id: "LoginAPI1",
    type: "LoginAPIEndpoint",
    position: { x: 600, y: 180 },
    data: {
      nodeType: "LoginAPIEndpoint",
      label: "Login API",
      props: {
        method: "POST",
        path: "/login",
        auth: "none",
      } satisfies LoginApiProps,
    },
  },
];

const INITIAL_EDGES: FlowEdge[] = [
  {
    id: "edge-LoginForm1-LoginAPI1",
    source: "LoginForm1",
    target: "LoginAPI1",
  },
];

function App(): JSX.Element {
  const [nodes, setNodes] = useState<FlowNode[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<FlowEdge[]>(INITIAL_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [yamlContent, setYamlContent] = useState("");
  const [yamlDirty, setYamlDirty] = useState(false);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [yamlReadOnly, setYamlReadOnly] = useState(true);

  const rules = DEFAULT_RULES;

  const workflowNodes = useMemo(
    () => toWorkflowNodes(nodes),
    [nodes],
  );

  const workflowEdges = useMemo(
    () => toWorkflowEdges(edges),
    [edges],
  );

  const computedYaml = useMemo(
    () => serializeWorkflow(workflowNodes, workflowEdges, rules),
    [workflowNodes, workflowEdges, rules],
  );

  useEffect(() => {
    if (!yamlDirty) {
      setYamlContent(computedYaml);
    }
  }, [computedYaml, yamlDirty]);

  const onNodesChange = useCallback((changes: FlowNodeChange[]) => {
    setNodes((current: FlowNode[]) => {
      const nextNodes = applyNodeChanges<CanvasNodeData>(changes, current) as FlowNode[];
      const removedIds = changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id);

      if (removedIds.length > 0) {
        setEdges((edges) =>
          edges.filter((edge) => {
            const source = edge.source ?? "";
            const target = edge.target ?? "";
            return !removedIds.includes(source) && !removedIds.includes(target);
          }),
        );
      }

      return nextNodes;
    });
  }, []);

  const onEdgesChange = useCallback((changes: FlowEdgeChange[]) => {
    setEdges((current: FlowEdge[]) => applyEdgeChanges<undefined>(changes, current) as FlowEdge[]);
  }, []);

  const onConnect = useCallback((connection: FlowConnection) => {
    const { source, target } = connection;
    if (!source || !target) {
      return;
    }

    setEdges((current: FlowEdge[]) => {
      const exists = current.some(
        (edge) => edge.source === source && edge.target === target,
      );
      if (exists) {
        return current;
      }

      return current.concat(createEdge(source, target));
    });
  }, []);

  const onSelectionChange = useCallback((params: FlowSelectionParams) => {
    const firstSelected = params.nodes?.[0]?.id;
    setSelectedNodeId(firstSelected ?? undefined);
  }, []);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    const nodeExists = nodes.some((node) => node.id === selectedNodeId);
    if (!nodeExists) {
      setSelectedNodeId(undefined);
    }
  }, [nodes, selectedNodeId]);

  const selectedNodeBase = nodes.find((node) => node.id === selectedNodeId);
  const selectedNodeSnapshot: CanvasNodeSnapshot | undefined = selectedNodeBase
    ? {
        id: selectedNodeBase.id,
        data: selectedNodeBase.data,
      }
    : undefined;

  const handleCommitNodeId = useCallback(
    (nodeId: string, nextId: string) => {
      const trimmed = nextId.trim();
      if (trimmed.length === 0) {
        return "Node ID cannot be empty.";
      }

      const conflict = nodes.some((node) => node.id === trimmed && node.id !== nodeId);
      if (conflict) {
        return `Node ID "${trimmed}" is already in use.`;
      }

      setNodes((current: FlowNode[]) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                id: trimmed,
              }
            : node,
        ),
      );

      setEdges((current: FlowEdge[]) =>
        current.map((edge) => {
          const source = typeof edge.source === "string" ? edge.source : null;
          const target = typeof edge.target === "string" ? edge.target : null;
          if (source === null || target === null) {
            return edge;
          }

          const nextSource = source === nodeId ? trimmed : source;
          const nextTarget = target === nodeId ? trimmed : target;
          if (nextSource === source && nextTarget === target) {
            return edge;
          }

          return {
            ...edge,
            id: `edge-${nextSource}-${nextTarget}-${nanoid(6)}`,
            source: nextSource,
            target: nextTarget,
          };
        }),
      );

      setSelectedNodeId(trimmed);
      return null;
    },
    [nodes],
  );

  const handleChangeNodeType = useCallback((nodeId: string, type: WorkflowNodeType) => {
    setNodes((current: FlowNode[]) =>
      current.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        if (node.type === type) {
          return node;
        }

        return {
          ...node,
          type,
          data: {
            nodeType: type,
            label: type === "LoginFormComponent" ? "Login Form" : "Login API",
            props: createDefaultProps(type),
          },
        };
      }),
    );
  }, []);

  const handleChangeLoginForm = useCallback((nodeId: string, props: LoginFormProps) => {
    setNodes((current: FlowNode[]) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                props,
              },
            }
          : node,
      ),
    );
  }, []);

  const handleChangeLoginApi = useCallback((nodeId: string, props: LoginApiProps) => {
    setNodes((current: FlowNode[]) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                props,
              },
            }
          : node,
      ),
    );
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((current: FlowNode[]) => current.filter((node) => node.id !== nodeId));
    setEdges((current: FlowEdge[]) =>
      current.filter((edge) => {
        const source = typeof edge.source === "string" ? edge.source : "";
        const target = typeof edge.target === "string" ? edge.target : "";
        return source !== nodeId && target !== nodeId;
      }),
    );
    setSelectedNodeId(undefined);
  }, []);

  const handleYamlChange = useCallback((value: string) => {
    setYamlContent(value);
    setYamlDirty(true);
    setYamlError(null);
  }, []);

  const handleYamlApply = useCallback(() => {
    try {
      const positionMap = Object.fromEntries(nodes.map((node) => [node.id, node.position]));
      const parsed = parseWorkflowYaml(yamlContent, positionMap);

      const nextNodes: FlowNode[] = parsed.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          nodeType: node.type,
          label: node.type === "LoginFormComponent" ? "Login Form" : "Login API",
          props: node.props as LoginFormProps | LoginApiProps,
        },
      }));

      const nextEdges: FlowEdge[] = parsed.edges.map((edge) =>
        createEdge(edge.from, edge.to, edge.id),
      );

      setNodes(nextNodes);
      setEdges(nextEdges);
      setYamlDirty(false);
      setYamlError(null);
      setSelectedNodeId(undefined);
    } catch (error) {
      setYamlError(error instanceof Error ? error.message : "Failed to parse YAML content.");
    }
  }, [yamlContent, nodes]);

  const handleYamlReset = useCallback(() => {
    setYamlContent(computedYaml);
    setYamlDirty(false);
    setYamlError(null);
  }, [computedYaml]);

  const handleToggleReadOnly = useCallback(() => {
    setYamlReadOnly((value) => !value);
  }, []);

  const handleAddNode = useCallback(
    (type: WorkflowNodeType) => {
      const nextId = generateNodeId(type, nodes);
      const defaultProps = createDefaultProps(type);
      const offset = nodes.length * 24;
      const newNode: Node<CanvasNodeData> = {
        id: nextId,
        type,
        position: {
          x: 200 + offset,
          y: 160 + offset,
        },
        data: {
          nodeType: type,
          label: type === "LoginFormComponent" ? "Login Form" : "Login API",
          props: defaultProps,
        },
      };

      setNodes((current: FlowNode[]) => current.concat(newNode));
      setSelectedNodeId(nextId);
    },
    [nodes],
  );

  const toolboxInfo = selectedNodeSnapshot
    ? `Editing ${selectedNodeSnapshot.data.nodeType} • ${selectedNodeSnapshot.id}`
    : "Select a node to view its properties.";

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <header className="app-header">
          <div>
            <h1>Workflow Agent Canvas</h1>
            <p>Create and synchronise workflow nodes with YAML definitions.</p>
          </div>
          <div className="add-node-actions">
            <button
              type="button"
              className="panel-primary"
              onClick={() => handleAddNode("LoginFormComponent")}
            >
              + Login Form
            </button>
            <button
              type="button"
              className="panel-primary"
              onClick={() => handleAddNode("LoginAPIEndpoint")}
            >
              + Login API
            </button>
          </div>
        </header>

        <main className="app-main">
          <div className="canvas-container">
            <div className="toolbox-hint">{toolboxInfo}</div>
            <Canvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
            />
          </div>

          <div className="side-panels">
            <PropertiesPanel
              node={selectedNodeSnapshot}
              onCommitId={handleCommitNodeId}
              onChangeType={handleChangeNodeType}
              onChangeLoginForm={handleChangeLoginForm}
              onChangeLoginApi={handleChangeLoginApi}
              onDeleteNode={handleDeleteNode}
            />

            <YamlPanel
              value={yamlContent}
              readOnly={yamlReadOnly}
              isDirty={yamlDirty}
              error={yamlError}
              onToggleReadOnly={handleToggleReadOnly}
              onChange={handleYamlChange}
              onApply={handleYamlApply}
              onReset={handleYamlReset}
            />
          </div>
        </main>
      </div>
    </ReactFlowProvider>
  );
}

function createEdge(source: string, target: string, id?: string): FlowEdge {
  return {
    id: id ?? `edge-${source}-${target}-${nanoid(6)}`,
    source,
    target,
  };
}

function createDefaultProps(type: WorkflowNodeType): LoginFormProps | LoginApiProps {
  if (type === "LoginFormComponent") {
    return {
      fields: [
        { name: "username", type: "string", required: true },
        { name: "password", type: "password", required: true },
      ],
      ui: {
        styleLibrary: "MaterialUI",
        validation: "basic",
      },
    };
  }

  return {
    method: "POST",
    path: "/login",
    auth: "none",
  };
}

function generateNodeId(type: WorkflowNodeType, nodes: FlowNode[]): string {
  const prefix = type === "LoginFormComponent" ? "LoginForm" : "LoginAPI";
  let index = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = `${prefix}${index}`;
    const exists = nodes.some((node) => node.id === candidate);
    if (!exists) {
      return candidate;
    }
    index += 1;
  }
}

function toWorkflowNodes(nodes: FlowNode[]): WorkflowNodeModel[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.data.nodeType,
    props: node.data.props as LoginFormProps | LoginApiProps,
    position: node.position,
  }));
}

function toWorkflowEdges(edges: FlowEdge[]): WorkflowEdgeModel[] {
  return edges
    .filter((edge): edge is FlowEdge & { source: string; target: string } => {
      return typeof edge.source === "string" && typeof edge.target === "string";
    })
    .map<WorkflowEdgeModel>((edge) => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
    }));
}

export default App;
