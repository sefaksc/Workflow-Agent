interface YamlPanelProps {
  value: string;
  readOnly: boolean;
  isDirty: boolean;
  error: string | null;
  onToggleReadOnly: () => void;
  onChange: (next: string) => void;
  onApply: () => void;
  onReset: () => void;
}

function YamlPanel({
  value,
  readOnly,
  isDirty,
  error,
  onToggleReadOnly,
  onChange,
  onApply,
  onReset,
}: YamlPanelProps): JSX.Element {
  return (
    <section className="yaml-panel">
      <header className="yaml-header">
        <h2>YAML</h2>
        <label className="yaml-toggle">
          <input type="checkbox" checked={readOnly} onChange={onToggleReadOnly} />
          Read only
        </label>
      </header>

      <textarea
        className="yaml-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        spellCheck={false}
      />

      {error ? <p className="yaml-error">{error}</p> : null}

      <div className="yaml-actions">
        <button
          type="button"
          className="panel-secondary"
          onClick={onReset}
          disabled={!isDirty || readOnly}
        >
          Reset
        </button>
        <button
          type="button"
          className="panel-primary"
          onClick={onApply}
          disabled={!isDirty || readOnly}
        >
          Apply Changes
        </button>
      </div>
    </section>
  );
}

export default YamlPanel;
