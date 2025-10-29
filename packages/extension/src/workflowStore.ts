export type WorkflowNodeType = "LoginFormComponent" | "LoginAPIEndpoint";

export type LoginFormFieldType = "string" | "password" | "email";

export interface LoginFormField {
  name: string;
  type: LoginFormFieldType;
  required: boolean;
}

export interface LoginFormProps {
  fields: LoginFormField[];
  ui: {
    styleLibrary: string;
    validation: string;
  };
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
  position: {
    x: number;
    y: number;
  };
}

export interface WorkflowConnection {
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
  connections: WorkflowConnection[];
  rules: WorkflowRules;
}

export interface WorkflowSnapshot {
  document: WorkflowDocument;
  yaml: string;
  generatedAt: string;
}

export type WebviewMessage = {
  type: "workflow/update";
  payload: WorkflowSnapshot;
};

export function isWorkflowUpdateMessage(message: unknown): message is WebviewMessage {
  if (
    typeof message !== "object" ||
    message === null ||
    (message as Record<string, unknown>).type !== "workflow/update"
  ) {
    return false;
  }

  const payload = (message as Record<string, unknown>).payload;
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  try {
    validateWorkflowSnapshot(payload as WorkflowSnapshot);
    return true;
  } catch {
    return false;
  }
}

function validateWorkflowSnapshot(snapshot: WorkflowSnapshot): void {
  if (typeof snapshot.generatedAt !== "string") {
    throw new Error("Snapshot missing generatedAt string.");
  }

  if (typeof snapshot.yaml !== "string") {
    throw new Error("Snapshot missing yaml string.");
  }

  const document = snapshot.document;
  if (!document || typeof document !== "object") {
    throw new Error("Snapshot missing document.");
  }

  if (document.version !== 1) {
    throw new Error("Workflow version mismatch.");
  }

  if (!Array.isArray(document.nodes)) {
    throw new Error("Workflow nodes must be an array.");
  }

  for (const node of document.nodes) {
    if (!node || typeof node !== "object") {
      throw new Error("Invalid node object.");
    }
    if (typeof node.id !== "string" || node.id.trim() === "") {
      throw new Error("Node must have an id.");
    }
    if (node.type !== "LoginFormComponent" && node.type !== "LoginAPIEndpoint") {
      throw new Error("Unsupported node type.");
    }
    if (!node.position || typeof node.position.x !== "number" || typeof node.position.y !== "number") {
      throw new Error("Node position must include numeric x and y.");
    }
    if (node.type === "LoginFormComponent") {
      if (!isLoginFormProps(node.props)) {
        throw new Error("LoginFormComponent props are invalid.");
      }
    } else if (!isLoginApiProps(node.props)) {
      throw new Error("LoginAPIEndpoint props are invalid.");
    }
  }

  if (!Array.isArray(document.connections)) {
    throw new Error("Workflow connections must be an array.");
  }

  for (const connection of document.connections) {
    if (!connection || typeof connection !== "object") {
      throw new Error("Invalid connection object.");
    }
    if (typeof connection.from !== "string" || typeof connection.to !== "string") {
      throw new Error("Connections must include string from/to.");
    }
  }

  if (!isWorkflowRules(document.rules)) {
    throw new Error("Workflow rules object is invalid.");
  }
}

export class WorkflowStore {
  private snapshot: WorkflowSnapshot | undefined;

  public update(snapshot: WorkflowSnapshot): void {
    this.snapshot = snapshot;
  }

  public getSnapshot(): WorkflowSnapshot | undefined {
    return this.snapshot;
  }
}

function isLoginFormProps(props: unknown): props is LoginFormProps {
  if (!props || typeof props !== "object") {
    return false;
  }
  const record = props as Record<string, unknown>;
  const fields = record.fields;
  const ui = record.ui;
  if (!Array.isArray(fields) || fields.length === 0) {
    return false;
  }
  if (!ui || typeof ui !== "object") {
    return false;
  }
  const uiRecord = ui as Record<string, unknown>;
  if (typeof uiRecord.styleLibrary !== "string" || typeof uiRecord.validation !== "string") {
    return false;
  }
  return fields.every(isLoginFormField);
}

function isLoginFormField(field: unknown): field is LoginFormField {
  if (!field || typeof field !== "object") {
    return false;
  }
  const record = field as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    (record.type === "string" || record.type === "password" || record.type === "email") &&
    typeof record.required === "boolean"
  );
}

function isLoginApiProps(props: unknown): props is LoginApiProps {
  if (!props || typeof props !== "object") {
    return false;
  }

  const record = props as Record<string, unknown>;
  if (
    record.method !== "GET" &&
    record.method !== "POST" &&
    record.method !== "PUT" &&
    record.method !== "DELETE" &&
    record.method !== "PATCH"
  ) {
    return false;
  }

  if (typeof record.path !== "string" || record.path.trim() === "") {
    return false;
  }

  if (record.auth !== "none" && record.auth !== "basic" && record.auth !== "token") {
    return false;
  }

  return true;
}

function isWorkflowRules(rules: unknown): rules is WorkflowRules {
  if (!rules || typeof rules !== "object") {
    return false;
  }
  const record = rules as Record<string, unknown>;
  const frontend = record.frontend;
  const backend = record.backend;
  const coding = record.coding;
  if (!frontend || typeof frontend !== "object") {
    return false;
  }
  if (!backend || typeof backend !== "object") {
    return false;
  }
  if (!coding || typeof coding !== "object") {
    return false;
  }
  const frontendRecord = frontend as Record<string, unknown>;
  const backendRecord = backend as Record<string, unknown>;
  const codingRecord = coding as Record<string, unknown>;

  return (
    typeof frontendRecord.framework === "string" &&
    (frontendRecord.language === "TS" || frontendRecord.language === "JS") &&
    typeof backendRecord.framework === "string" &&
    (backendRecord.language === "TS" || backendRecord.language === "JS") &&
    typeof codingRecord.formatter === "string" &&
    typeof codingRecord.style === "string"
  );
}
