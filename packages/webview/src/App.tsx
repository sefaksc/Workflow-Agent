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
  type ReactFlowInstance,
} from "reactflow";
import { nanoid } from "nanoid";
import ELK from "elkjs/lib/elk.bundled.js";
import Canvas from "./components/Canvas";
import PropertiesPanel from "./components/PropertiesPanel";
import YamlPanel from "./components/YamlPanel";
import { DEFAULT_RULES, parseWorkflowYaml, serializeWorkflow } from "./yaml";
import type {
  CanvasNodeData,
  CanvasNodeSnapshot,
  LoginApiProps,
  LoginFormProps,
  WorkflowNodeModel,
  WorkflowNodeType,
  WorkflowEdgeModel,
  WorkflowDocument,
  WorkflowRules,
  WorkflowSnapshot,
} from "./types";
import "./styles.css";
import "reactflow/dist/style.css";
import { postMessage } from "./webviewBridge";

type FlowNode = Node<CanvasNodeData>;
type FlowEdge = Edge<undefined>;
type FlowNodeChange = NodeChange<CanvasNodeData>;
type FlowEdgeChange = EdgeChange<undefined>;
type FlowConnection = Connection<CanvasNodeData, undefined>;
type FlowSelectionParams = OnSelectionChangeParams<CanvasNodeData, undefined>;
type Theme = "dark" | "light";

type WorkflowCommand =
  | { kind: "new" }
  | { kind: "addNode"; nodeType: WorkflowNodeType; nodeId?: string }
  | { kind: "connect"; from: string; to: string }
  | { kind: "setRules"; rules: WorkflowRules };

type InboundMessage =
  | { type: "workflow/replace"; payload: WorkflowSnapshot }
  | { type: "workflow/applyCommands"; payload: WorkflowCommand[] };

const DEFAULT_NODE_DIMENSIONS = {
  width: 260,
  height: 140,
} as const;


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
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const stored = window.localStorage.getItem("workflowAgentTheme");
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  });
  const [nodes, setNodes] = useState<FlowNode[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<FlowEdge[]>(INITIAL_EDGES);
  const [rules, setRules] = useState<WorkflowRules>(() => createDefaultRules());
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [yamlContent, setYamlContent] = useState("");
  const [yamlDirty, setYamlDirty] = useState(false);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [yamlReadOnly, setYamlReadOnly] = useState(true);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [isAutoLayoutRunning, setIsAutoLayoutRunning] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const elk = useMemo(() => new ELK(), []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.style.colorScheme = theme;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("workflowAgentTheme", theme);
    }
  }, [theme]);

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
    const workflowDocument: WorkflowDocument = {
      version: 1,
      nodes: workflowNodes,
      connections: workflowEdges.map(({ from, to }) => ({ from, to })),
      rules,
    };

    postMessage({
      type: "workflow/update",
      payload: {
        document: workflowDocument,
        yaml: computedYaml,
        generatedAt: new Date().toISOString(),
      },
    });
  }, [workflowNodes, workflowEdges, rules, computedYaml]);

  useEffect(() => {
    if (!yamlDirty) {
      setYamlContent(computedYaml);
    }
  }, [computedYaml, yamlDirty]);

  const applySnapshot = useCallback((snapshot: WorkflowSnapshot) => {
    const document = snapshot.document;
    const nextNodes: FlowNode[] = document.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: {
        nodeType: node.type,
        label: node.type === "LoginFormComponent" ? "Login Form" : "Login API",
        props: node.props as LoginFormProps | LoginApiProps,
      },
    }));

    const nextEdges: FlowEdge[] = document.connections.map((connection) =>
      createEdge(connection.from, connection.to),
    );

    setNodes(nextNodes);
    setEdges(nextEdges);
    setRules(cloneRules(document.rules));
    setYamlContent(snapshot.yaml);
    setYamlDirty(false);
    setYamlError(null);
    setSelectedNodeId(undefined);
    setLayoutError(null);
  }, []);

  const applyCommands = useCallback(
    (commands: WorkflowCommand[]) => {
      if (!commands || commands.length === 0) {
        return;
      }

      let nextNodes = [...nodes];
      let nextEdges = [...edges];
      let nextRules = cloneRules(rules);
      let nextSelected = selectedNodeId;

      commands.forEach((command) => {
        switch (command.kind) {
          case "new": {
            nextNodes = [];
            nextEdges = [];
            nextRules = createDefaultRules();
            nextSelected = undefined;
            break;
          }
          case "addNode": {
            const candidateId =
              command.nodeId && command.nodeId.trim().length > 0
                ? command.nodeId.trim()
                : generateNodeId(command.nodeType, nextNodes);
            if (nextNodes.some((node) => node.id === candidateId)) {
              nextSelected = candidateId;
              break;
            }
            const offset = nextNodes.length * 24;
            const newNode: FlowNode = {
              id: candidateId,
              type: command.nodeType,
              position: {
                x: 200 + offset,
                y: 160 + offset,
              },
              data: {
                nodeType: command.nodeType,
                label: command.nodeType === "LoginFormComponent" ? "Login Form" : "Login API",
                props: createDefaultProps(command.nodeType) as LoginFormProps | LoginApiProps,
              },
            };
            nextNodes = nextNodes.concat(newNode);
            nextSelected = candidateId;
            break;
          }
          case "connect": {
            const sourceExists = nextNodes.some((node) => node.id === command.from);
            const targetExists = nextNodes.some((node) => node.id === command.to);
            const alreadyConnected = nextEdges.some(
              (edge) => edge.source === command.from && edge.target === command.to,
            );
            if (sourceExists && targetExists && !alreadyConnected) {
              nextEdges = nextEdges.concat(createEdge(command.from, command.to));
            }
            break;
          }
          case "setRules": {
            nextRules = cloneRules(command.rules);
            break;
          }
          default:
            break;
        }
      });

      setNodes(nextNodes);
      setEdges(nextEdges);
      setRules(nextRules);
      setSelectedNodeId(nextSelected);
      setYamlDirty(false);
      setYamlError(null);
      setLayoutError(null);
    },
    [edges, nodes, rules, selectedNodeId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleMessage = (event: MessageEvent<InboundMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object" || typeof message.type !== "string") {
        return;
      }

      if (message.type === "workflow/replace") {
        applySnapshot(message.payload);
      } else if (message.type === "workflow/applyCommands") {
        applyCommands(message.payload ?? []);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [applyCommands, applySnapshot]);

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
      setRules(cloneRules(parsed.rules));
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

  const handleToggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const handleFitView = useCallback(() => {
    reactFlowInstance?.fitView({ padding: 0.24, duration: 500 });
  }, [reactFlowInstance]);

  const handleAutoLayout = useCallback(async () => {
    if (isAutoLayoutRunning) {
      return;
    }

    if (nodes.length === 0) {
      setLayoutError("Auto-layout için en az bir düğüm ekleyin.");
      return;
    }

    setIsAutoLayoutRunning(true);
    setLayoutError(null);

    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.layered.spacing.nodeNodeBetweenLayers": "120",
        "elk.spacing.nodeNode": "90",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.spacing.edgeNode": "60",
      },
      children: nodes.map((node) => ({
        id: node.id,
        width: DEFAULT_NODE_DIMENSIONS.width,
        height: DEFAULT_NODE_DIMENSIONS.height,
      })),
      edges: edges
        .filter((edge) => typeof edge.source === "string" && typeof edge.target === "string")
        .map((edge) => ({
          id: edge.id,
          sources: [edge.source as string],
          targets: [edge.target as string],
        })),
    };

    try {
      const layout = await elk.layout(graph);
      const positions = new Map(
        (layout.children ?? []).map((child) => [child.id, child] as const),
      );

      setNodes((current) =>
        current.map((node) => {
          const layoutNode = positions.get(node.id);
          if (!layoutNode || layoutNode.x === undefined || layoutNode.y === undefined) {
            return node;
          }

          return {
            ...node,
            position: {
              x: layoutNode.x,
              y: layoutNode.y,
            },
          };
        }),
      );

      requestAnimationFrame(() => {
        reactFlowInstance?.fitView({ padding: 0.2, duration: 600 });
      });
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : "Auto-layout başarısız oldu.");
    } finally {
      setIsAutoLayoutRunning(false);
    }
  }, [edges, elk, isAutoLayoutRunning, nodes, reactFlowInstance, setNodes]);

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
      setLayoutError(null);
    },
    [nodes],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.getAttribute("contenteditable") === "true"
        ) {
          return;
        }
      }

      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "l") {
        event.preventDefault();
        void handleAutoLayout();
      } else if (key === "f") {
        event.preventDefault();
        handleFitView();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [handleAutoLayout, handleFitView]);

  useEffect(() => {
    if (!reactFlowInstance) {
      return;
    }

    reactFlowInstance.fitView({ padding: 0.24 });
  }, [reactFlowInstance]);

  const handleRunWorkflow = useCallback(() => {
    postMessage({ type: "workflow/run" });
  }, []);

  const toolboxInfo = selectedNodeSnapshot
    ? `Editing ${selectedNodeSnapshot.data.nodeType} • ${selectedNodeSnapshot.id}`
    : "Select a node to view its properties.";
  const layoutMessage = isAutoLayoutRunning ? "Auto layout çalışıyor…" : layoutError;
  const themeToggleLabel = theme === "dark" ? "Light mode" : "Dark mode";

  return (
    <ReactFlowProvider>
      <div className={`app-shell theme-${theme}`}>
        <header className="app-header">
          <div className="header-details">
            <h1>Workflow Agent Canvas</h1>
            <p>Create and synchronise workflow nodes with YAML definitions.</p>
            <div className="header-shortcuts">Auto layout: Ctrl/Cmd + L · Fit view: Ctrl/Cmd + F</div>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="toolbar-button"
              onClick={() => void handleAutoLayout()}
              disabled={isAutoLayoutRunning || nodes.length === 0}
            >
              {isAutoLayoutRunning ? "Auto layout…" : "Auto layout"}
            </button>
            <button
              type="button"
              className="toolbar-button"
              onClick={handleFitView}
              disabled={!reactFlowInstance}
            >
              Fit view
            </button>
            <button type="button" className="toolbar-button" onClick={handleToggleTheme}>
              {themeToggleLabel}
            </button>
            <span className="toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className="toolbar-button toolbar-button--primary"
              onClick={() => handleAddNode("LoginFormComponent")}
            >
              + Login Form
            </button>
            <button
              type="button"
              className="toolbar-button toolbar-button--primary"
              onClick={() => handleAddNode("LoginAPIEndpoint")}
            >
              + Login API
            </button>
          </div>
        </header>

        <main className="app-main">
          <div className="canvas-container">
            <div className="toolbox-hint">
              <span>{toolboxInfo}</span>
              <div className="toolbox-controls">
                {layoutMessage ? (
                  <span
                    className={`toolbox-status ${layoutError ? "toolbox-status--error" : "toolbox-status--info"}`}
                  >
                    {layoutMessage}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="toolbox-button"
                  onClick={handleRunWorkflow}
                  disabled={nodes.length === 0}
                >
                  Run Workflow
                </button>
              </div>
            </div>
            <Canvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onSelectionChange={onSelectionChange}
              onInit={(instance) => setReactFlowInstance(instance)}
              theme={theme}
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

function cloneRules(rules: WorkflowRules): WorkflowRules {
  return {
    frontend: { ...rules.frontend },
    backend: { ...rules.backend },
    coding: { ...rules.coding },
  };
}

function createDefaultRules(): WorkflowRules {
  return cloneRules(DEFAULT_RULES);
}

export default App;
