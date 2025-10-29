import { Handle, Position, type NodeProps } from "reactflow";
import type { CanvasNodeData, LoginApiProps, LoginFormProps } from "../types";

function NodeCard({
  title,
  subtitle,
  selected,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
}): JSX.Element {
  return (
    <div className={`node-card ${selected ? "node-card--selected" : ""}`}>
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  );
}

export function LoginFormNode({ data, selected }: NodeProps<CanvasNodeData>): JSX.Element {
  const loginFormProps = isLoginFormData(data) ? data.props : undefined;
  const fieldCount = loginFormProps?.fields.length ?? 0;
  const subtitle =
    loginFormProps !== undefined
      ? `${fieldCount} field${fieldCount === 1 ? "" : "s"} defined`
      : "Missing field configuration";

  return (
    <div className="node-wrapper">
      <Handle type="target" position={Position.Left} className="node-handle node-handle--target" />
      <NodeCard title="Login Form" subtitle={subtitle} selected={selected ?? false} />
      <Handle type="source" position={Position.Right} className="node-handle node-handle--source" />
    </div>
  );
}

export function LoginApiNode({ data, selected }: NodeProps<CanvasNodeData>): JSX.Element {
  const apiProps = isLoginApiData(data) ? data.props : undefined;
  const method = apiProps?.method ?? "POST";
  const path = apiProps?.path ?? "/route-not-set";
  const subtitle = `${method} ${path}`;

  return (
    <div className="node-wrapper">
      <Handle type="target" position={Position.Left} className="node-handle node-handle--target" />
      <NodeCard title="Login API" subtitle={subtitle} selected={selected ?? false} />
      <Handle type="source" position={Position.Right} className="node-handle node-handle--source" />
    </div>
  );
}

export const NODE_TYPES = {
  LoginFormComponent: LoginFormNode,
  LoginAPIEndpoint: LoginApiNode,
};

function isLoginFormData(
  data: CanvasNodeData,
): data is CanvasNodeData & { props: LoginFormProps } {
  return data.nodeType === "LoginFormComponent";
}

function isLoginApiData(
  data: CanvasNodeData,
): data is CanvasNodeData & { props: LoginApiProps } {
  return data.nodeType === "LoginAPIEndpoint";
}
