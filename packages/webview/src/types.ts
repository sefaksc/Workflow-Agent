import type { XYPosition } from "reactflow";

export type WorkflowNodeType = "LoginFormComponent" | "LoginAPIEndpoint";

export type LoginFormFieldType = "string" | "password" | "email";

export interface LoginFormField {
  name: string;
  type: LoginFormFieldType;
  required: boolean;
}

export interface LoginFormUIProps {
  styleLibrary: string;
  validation: string;
}

export interface LoginFormProps {
  fields: LoginFormField[];
  ui: LoginFormUIProps;
}

export interface LoginApiProps {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  auth: "none" | "basic" | "token";
}

export type WorkflowNodeProps = LoginFormProps | LoginApiProps;

export interface WorkflowNodeModel {
  id: string;
  type: WorkflowNodeType;
  props: WorkflowNodeProps;
  position: XYPosition;
}

export interface WorkflowEdgeModel {
  id: string;
  from: string;
  to: string;
}

export interface WorkflowRules {
  frontend: {
    framework: string;
    language: "TS" | "JS";
  };
  backend: {
    framework: string;
    language: "TS" | "JS";
  };
  coding: {
    formatter: string;
    style: string;
  };
}

export interface WorkflowDocument {
  version: number;
  nodes: WorkflowNodeModel[];
  connections: Array<{ from: string; to: string }>;
  rules: WorkflowRules;
}

export interface CanvasNodeData {
  nodeType: WorkflowNodeType;
  props: WorkflowNodeProps;
  label: string;
}
export interface CanvasNodeSnapshot {
  id: string;
  data: CanvasNodeData;
}
