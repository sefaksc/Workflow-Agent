import { useEffect, useMemo, useState } from "react";
import type {
  CanvasNodeSnapshot,
  LoginApiProps,
  LoginFormField,
  LoginFormProps,
  WorkflowNodeType,
} from "../types";

interface PropertiesPanelProps {
  node: CanvasNodeSnapshot | undefined;
  onCommitId: (nodeId: string, nextId: string) => string | null;
  onChangeType: (nodeId: string, type: WorkflowNodeType) => void;
  onChangeLoginForm: (nodeId: string, props: LoginFormProps) => void;
  onChangeLoginApi: (nodeId: string, props: LoginApiProps) => void;
  onDeleteNode: (nodeId: string) => void;
}

function PropertiesPanel({
  node,
  onCommitId,
  onChangeType,
  onChangeLoginForm,
  onChangeLoginApi,
  onDeleteNode,
}: PropertiesPanelProps): JSX.Element {
  const [localId, setLocalId] = useState(node?.id ?? "");
  const [idError, setIdError] = useState<string | null>(null);

  useEffect(() => {
    setLocalId(node?.id ?? "");
    setIdError(null);
  }, [node?.id]);

  const content = useMemo(() => {
    if (!node) {
      return <p className="panel-placeholder">Select a node to edit its properties.</p>;
    }

    const { id, data } = node;
    const { nodeType } = data;

    return (
      <>
        <section>
          <label className="panel-label" htmlFor="node-id">
            Node ID
          </label>
          <input
            id="node-id"
            className={`panel-input ${idError ? "panel-input--error" : ""}`}
            value={localId}
            onChange={(event) => setLocalId(event.target.value)}
            onBlur={() => {
              if (localId === id) {
                setIdError(null);
                return;
              }
              const error = onCommitId(id, localId);
              setIdError(error);
            }}
            placeholder="LoginForm1"
          />
          {idError ? <p className="panel-error">{idError}</p> : null}
        </section>

        <section>
          <label className="panel-label" htmlFor="node-type">
            Node Type
          </label>
          <select
            id="node-type"
            className="panel-input"
            value={nodeType}
            onChange={(event) => onChangeType(id, event.target.value as WorkflowNodeType)}
          >
            <option value="LoginFormComponent">Login Form Component</option>
            <option value="LoginAPIEndpoint">Login API Endpoint</option>
          </select>
        </section>

        <section>
          <h3 className="panel-subheading">Configuration</h3>
          {nodeType === "LoginFormComponent" ? (
            <LoginFormEditor
              props={data.props as LoginFormProps}
              onChange={(next) => onChangeLoginForm(id, next)}
            />
          ) : (
            <LoginApiEditor
              props={data.props as LoginApiProps}
              onChange={(next) => onChangeLoginApi(id, next)}
            />
          )}
        </section>

        <button
          type="button"
          className="panel-danger"
          onClick={() => onDeleteNode(id)}
        >
          Delete Node
        </button>
      </>
    );
  }, [node, localId, idError, onCommitId, onChangeType, onChangeLoginForm, onChangeLoginApi, onDeleteNode]);

  return (
    <aside className="properties-panel">
      <h2>Properties</h2>
      {content}
    </aside>
  );
}

function LoginFormEditor({
  props,
  onChange,
}: {
  props: LoginFormProps;
  onChange: (next: LoginFormProps) => void;
}): JSX.Element {
  const updateField = (index: number, nextField: LoginFormField) => {
    const nextFields = props.fields.map((field, fieldIndex) =>
      fieldIndex === index ? nextField : field,
    );
    onChange({ ...props, fields: nextFields });
  };

  const addField = () => {
    onChange({
      ...props,
      fields: [
        ...props.fields,
        {
          name: "newField",
          type: "string",
          required: false,
        },
      ],
    });
  };

  const removeField = (index: number) => {
    if (props.fields.length === 1) {
      return;
    }

    const nextFields = props.fields.filter((_, fieldIndex) => fieldIndex !== index);
    onChange({ ...props, fields: nextFields });
  };

  return (
    <div className="panel-group">
      <div className="panel-row">
        <label className="panel-label" htmlFor="loginform-style">
          Style Library
        </label>
        <input
          id="loginform-style"
          className="panel-input"
          value={props.ui.styleLibrary}
          onChange={(event) =>
            onChange({ ...props, ui: { ...props.ui, styleLibrary: event.target.value } })
          }
        />
      </div>

      <div className="panel-row">
        <label className="panel-label" htmlFor="loginform-validation">
          Validation
        </label>
        <input
          id="loginform-validation"
          className="panel-input"
          value={props.ui.validation}
          onChange={(event) =>
            onChange({ ...props, ui: { ...props.ui, validation: event.target.value } })
          }
        />
      </div>

      <div className="panel-row panel-row--header">
        <h4>Fields</h4>
        <button type="button" className="panel-secondary" onClick={addField}>
          Add Field
        </button>
      </div>

      {props.fields.map((field, index) => (
        <div key={`${field.name}-${index}`} className="field-row">
          <input
            className="panel-input"
            value={field.name}
            placeholder="username"
            onChange={(event) =>
              updateField(index, { ...field, name: event.target.value })
            }
          />
          <select
            className="panel-input"
            value={field.type}
            onChange={(event) =>
              updateField(index, { ...field, type: event.target.value as LoginFormField["type"] })
            }
          >
            <option value="string">Text</option>
            <option value="password">Password</option>
            <option value="email">Email</option>
          </select>
          <label className="field-toggle">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) =>
                updateField(index, { ...field, required: event.target.checked })
              }
            />
            Required
          </label>
          <button
            type="button"
            className="panel-icon"
            aria-label="Remove field"
            onClick={() => removeField(index)}
            disabled={props.fields.length === 1}
          >
            X
          </button>
        </div>
      ))}
    </div>
  );
}

function LoginApiEditor({
  props,
  onChange,
}: {
  props: LoginApiProps;
  onChange: (next: LoginApiProps) => void;
}): JSX.Element {
  return (
    <div className="panel-group">
      <div className="panel-row">
        <label className="panel-label" htmlFor="loginapi-method">
          HTTP Method
        </label>
        <select
          id="loginapi-method"
          className="panel-input"
          value={props.method}
          onChange={(event) =>
            onChange({ ...props, method: event.target.value as LoginApiProps["method"] })
          }
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
      </div>

      <div className="panel-row">
        <label className="panel-label" htmlFor="loginapi-path">
          Path
        </label>
        <input
          id="loginapi-path"
          className="panel-input"
          value={props.path}
          onChange={(event) => onChange({ ...props, path: event.target.value })}
        />
      </div>

      <div className="panel-row">
        <label className="panel-label" htmlFor="loginapi-auth">
          Authentication
        </label>
        <select
          id="loginapi-auth"
          className="panel-input"
          value={props.auth}
          onChange={(event) =>
            onChange({ ...props, auth: event.target.value as LoginApiProps["auth"] })
          }
        >
          <option value="none">None</option>
          <option value="basic">Basic</option>
          <option value="token">Token</option>
        </select>
      </div>
    </div>
  );
}

export default PropertiesPanel;
