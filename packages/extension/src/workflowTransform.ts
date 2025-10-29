import type {
  LoginApiProps,
  LoginFormField,
  LoginFormProps,
  WorkflowSnapshot,
} from "./workflowStore";

export interface EngineLoginApiProps extends LoginApiProps {
  formFields: LoginFormField[];
  formSourceIds: string[];
}

export type EngineWorkflowNode =
  | {
      id: string;
      type: "LoginFormComponent";
      props: LoginFormProps;
      position: { x: number; y: number };
    }
  | {
      id: string;
      type: "LoginAPIEndpoint";
      props: EngineLoginApiProps;
      position: { x: number; y: number };
    };

export interface EngineWorkflowDocument {
  version: number;
  nodes: EngineWorkflowNode[];
  connections: Array<{ from: string; to: string }>;
  rules: WorkflowSnapshot["document"]["rules"];
}

export function toEngineWorkflow(snapshot: WorkflowSnapshot): EngineWorkflowDocument {
  const nodesById = new Map(snapshot.document.nodes.map((node) => [node.id, node]));
  const aggregation = new Map<
    string,
    {
      fields: LoginFormField[];
      sourceIds: string[];
    }
  >();

  for (const connection of snapshot.document.connections) {
    const source = nodesById.get(connection.from);
    const target = nodesById.get(connection.to);
    if (!source || !target) {
      continue;
    }
    if (source.type === "LoginFormComponent" && target.type === "LoginAPIEndpoint") {
      const sourceProps = source.props as LoginFormProps;
      const formFields = cloneFields(sourceProps.fields);
      const existing = aggregation.get(target.id) ?? { fields: [], sourceIds: [] };
      const mergedFields = mergeFields(existing.fields, formFields);
      const sourceIds = Array.from(new Set(existing.sourceIds.concat(source.id)));
      aggregation.set(target.id, { fields: mergedFields, sourceIds });
    }
  }

  const engineNodes: EngineWorkflowNode[] = snapshot.document.nodes.map((node) => {
    if (node.type === "LoginFormComponent") {
      return {
        id: node.id,
        type: "LoginFormComponent",
        props: cloneLoginFormProps(node.props as LoginFormProps),
        position: { ...node.position },
      };
    }

    const baseProps = node.props as LoginApiProps;
    const aggregated = aggregation.get(node.id) ?? { fields: [] as LoginFormField[], sourceIds: [] as string[] };
    return {
      id: node.id,
      type: "LoginAPIEndpoint",
      props: {
        ...cloneLoginApiProps(baseProps),
        formFields: aggregated.fields,
        formSourceIds: aggregated.sourceIds,
      },
      position: { ...node.position },
    };
  });

  return {
    version: snapshot.document.version,
    nodes: engineNodes,
    connections: snapshot.document.connections.map(({ from, to }) => ({ from, to })),
    rules: snapshot.document.rules,
  };
}

function cloneLoginFormProps(props: LoginFormProps): LoginFormProps {
  return {
    fields: cloneFields(props.fields),
    ui: {
      styleLibrary: props.ui.styleLibrary,
      validation: props.ui.validation,
    },
  };
}

function cloneFields(fields: LoginFormField[]): LoginFormField[] {
  return fields.map((field) => ({
    name: field.name,
    type: field.type,
    required: field.required,
  }));
}

function cloneLoginApiProps(props: LoginApiProps): LoginApiProps {
  return {
    method: props.method,
    path: props.path,
    auth: props.auth,
  };
}

function mergeFields(existing: LoginFormField[], next: LoginFormField[]): LoginFormField[] {
  const merged: LoginFormField[] = existing.map((field) => ({ ...field }));
  const names = new Set(existing.map((field) => field.name));
  for (const field of next) {
    if (names.has(field.name)) {
      continue;
    }
    merged.push({ ...field });
    names.add(field.name);
  }
  return merged;
}
