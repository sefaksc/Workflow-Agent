import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { XYPosition } from "reactflow";
import {
  WorkflowNodeModel,
  WorkflowEdgeModel,
  WorkflowRules,

  LoginFormProps,
  LoginFormField,
  LoginApiProps,
} from "./types";

export const DEFAULT_RULES: WorkflowRules = {
  frontend: {
    framework: "React",
    language: "TS",
  },
  backend: {
    framework: "NodeExpress",
    language: "TS",
  },
  coding: {
    formatter: "prettier",
    style: "airbnb",
  },
};

export function serializeWorkflow(
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
  rules: WorkflowRules = DEFAULT_RULES,
): string {
  const document = {
    version: 1,
    nodes: nodes.map(({ id, type, props }) => ({
      id,
      type,
      props,
    })),
    connections: edges.map(({ from, to }) => ({
      from,
      to,
    })),
    rules,
  };

  return stringifyYaml(document, { indent: 2 });
}

export function parseWorkflowYaml(
  yamlText: string,
  positions: Record<string, XYPosition>,
): {
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  rules: WorkflowRules;
} {
  const raw = parseYaml(yamlText);
  if (!isRecord(raw)) {
    throw new Error("YAML root must be an object.");
  }

  const document = raw as Record<string, unknown>;

  const version = document.version;
  if (version !== 1) {
    throw new Error("Only workflow version 1 is supported.");
  }

  const nodeEntries = document.nodes;
  if (!Array.isArray(nodeEntries)) {
    throw new Error("`nodes` must be an array.");
  }

  const connectionEntries = document.connections;
  if (!Array.isArray(connectionEntries)) {
    throw new Error("`connections` must be an array.");
  }

  const nodes = nodeEntries.map((node, index) => parseNode(node, index));

  const edges: WorkflowEdgeModel[] = connectionEntries.map((connection, index) => {
    if (!isRecord(connection)) {
      throw new Error("Connections must include string `from` and `to` values.");
    }

    const from = connection.from;
    const to = connection.to;
    if (typeof from !== "string" || typeof to !== "string") {
      throw new Error("Connections must include string `from` and `to` values.");
    }

    return {
      id: `edge-${from}-${to}-${index}`,
      from,
      to,
    };
  });

  const nextRules = isWorkflowRules(document.rules) ? document.rules : DEFAULT_RULES;

  const nodesWithPositions = applyPositions(nodes, positions);

  return {
    nodes: nodesWithPositions,
    edges,
    rules: nextRules,
  };
}

function parseNode(node: unknown, index: number): WorkflowNodeModel {
  if (!isRecord(node)) {
    throw new Error("Each node must be an object.");
  }

  const id = node.id;
  const type = node.type;
  const props = node.props;

  if (typeof id !== "string" || id.trim() === "") {
    throw new Error("Each node must include a non-empty `id`.");
  }

  if (type !== "LoginFormComponent" && type !== "LoginAPIEndpoint") {
    throw new Error(`Unsupported node type at index ${index}: ${String(type)}`);
  }

  const validatedProps =
    type === "LoginFormComponent"
      ? validateLoginFormProps(props)
      : validateLoginApiProps(props);

  return {
    id,
    type,
    props: validatedProps,
    position: { x: 0, y: 0 },
  };
}

function applyPositions(
  nodes: WorkflowNodeModel[],
  existingPositions: Record<string, XYPosition>,
): WorkflowNodeModel[] {
  const nodeSpacingX = 260;
  const nodeSpacingY = 180;

  return nodes.map((node, index) => {
    const oldPosition = existingPositions[node.id];
    if (oldPosition) {
      return {
        ...node,
        position: oldPosition,
      };
    }

    const column = index % 3;
    const row = Math.floor(index / 3);

    return {
      ...node,
      position: {
        x: 200 + column * nodeSpacingX,
        y: 120 + row * nodeSpacingY,
      },
    };
  });
}

function validateLoginFormProps(props: unknown): LoginFormProps {
  if (!isRecord(props)) {
    throw new Error("LoginFormComponent props must be an object.");
  }

  const fields = props.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("LoginFormComponent props must include a non-empty `fields` array.");
  }

  const ui = props.ui;
  if (!isRecord(ui) || typeof ui.styleLibrary !== "string" || typeof ui.validation !== "string") {
    throw new Error("LoginFormComponent props must include a `ui` object with `styleLibrary` and `validation` strings.");
  }

  const parsedFields = fields.map((field, index) => parseLoginFormField(field, index));

  return {
    fields: parsedFields,
    ui: {
      styleLibrary: ui.styleLibrary,
      validation: ui.validation,
    },
  };
}

function parseLoginFormField(field: unknown, index: number): LoginFormField {
  if (!isRecord(field)) {
    throw new Error(`Field at index ${index} must be an object.`);
  }

  const name = field.name;
  const type = field.type;
  const required = field.required;

  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(`Field at index ${index} must include a non-empty name.`);
  }

  if (type !== "string" && type !== "password" && type !== "email") {
    throw new Error(`Unsupported field type at index ${index}: ${String(type)}`);
  }

  if (typeof required !== "boolean") {
    throw new Error(`Field at index ${index} must include a boolean 'required' flag.`);
  }

  return {
    name,
    type,
    required,
  };
}

function validateLoginApiProps(props: unknown): LoginApiProps {
  if (!isRecord(props)) {
    throw new Error("LoginAPIEndpoint props must be an object.");
  }

  const method = props.method;
  const path = props.path;
  const auth = props.auth ?? "none";

  if (method !== "GET" && method !== "POST" && method !== "PUT" && method !== "DELETE" && method !== "PATCH") {
    throw new Error("LoginAPIEndpoint props must include a valid HTTP method.");
  }

  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("LoginAPIEndpoint props must include a non-empty `path` string.");
  }

  if (auth !== "none" && auth !== "basic" && auth !== "token") {
    throw new Error("LoginAPIEndpoint props must include a valid `auth` value.");
  }

  return {
    method,
    path,
    auth,
  };
}

function isWorkflowRules(value: unknown): value is WorkflowRules {
  if (!isRecord(value)) {
    return false;
  }

  const frontend = value.frontend;
  const backend = value.backend;
  const coding = value.coding;

  return (
    isRecord(frontend) &&
    typeof frontend.framework === "string" &&
    (frontend.language === "TS" || frontend.language === "JS") &&
    isRecord(backend) &&
    typeof backend.framework === "string" &&
    (backend.language === "TS" || backend.language === "JS") &&
    isRecord(coding) &&
    typeof coding.formatter === "string" &&
    typeof coding.style === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
