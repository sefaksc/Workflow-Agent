"""Template-first workflow execution for sprint 6."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

from .nodes import login_api, login_form

DEFAULT_RULES: dict[str, Any] = {
    "frontend": {"framework": "React", "language": "TS"},
    "backend": {"framework": "NodeExpress", "language": "TS"},
    "coding": {"formatter": "prettier", "style": "airbnb"},
}

SUPPORTED_FRONTEND_FRAMEWORKS = {"React"}
SUPPORTED_BACKEND_FRAMEWORKS = {"NodeExpress"}
SUPPORTED_LANGUAGES = {"TS", "JS"}
SUPPORTED_STYLE_LIBRARIES = {"materialui", "material-ui", "mui"}


class WorkflowError(Exception):
    """Base class for workflow related failures."""


class DocumentValidationError(WorkflowError):
    """Raised when the incoming workflow snapshot is structurally invalid."""


class UnsupportedConfigurationError(WorkflowError):
    """Raised when the requested configuration cannot be satisfied."""


@dataclass(frozen=True)
class LoginField:
    """Normalised representation of a form field."""

    name: str
    field_type: str
    required: bool

    @property
    def display_label(self) -> str:
        return _title_case(self.name)

    @property
    def html_input_type(self) -> str:
        return _normalise_input_type(self.field_type)

    @property
    def auto_complete(self) -> str | None:
        return _auto_complete_hint(self.field_type)


@dataclass(frozen=True)
class LoginFormNode:
    """Canvas node describing a login form component."""

    id: str
    fields: list[LoginField]
    style_library: str
    validation: str
    position: dict[str, Any]


@dataclass(frozen=True)
class LoginApiNode:
    """Canvas node describing a login API endpoint."""

    id: str
    method: str
    path: str
    auth: str
    form_fields: list[LoginField]
    form_source_ids: list[str]
    position: dict[str, Any]


@dataclass(frozen=True)
class WorkflowRules:
    """Rule set normalised from the workflow snapshot."""

    frontend_framework: str
    frontend_language: str
    backend_framework: str
    backend_language: str
    formatter: str
    style: str


@dataclass
class WorkflowContext:
    """Mutable state shared across workflow steps."""

    yaml_text: str | None
    rules: WorkflowRules
    forms: list[LoginFormNode]
    apis: list[LoginApiNode]
    warnings: list[str] = field(default_factory=list)
    files: list[tuple[str, str]] = field(default_factory=list)


@dataclass(frozen=True)
class WorkflowResult:
    """Immutable representation of generated artefacts."""

    files: list[dict[str, str]]
    warnings: list[str]


class TemplateWorkflowRunner:
    """Deterministic template-first workflow runner."""

    def run(self, document: dict[str, Any] | None, yaml_text: str | None) -> WorkflowResult:
        context = self._start(document, yaml_text)
        self._generate_ui(context)
        self._generate_api(context)
        self._synthesise(context)
        self._stop(context)
        return WorkflowResult(
            files=[{"path": path, "content": content} for path, content in context.files],
            warnings=list(context.warnings),
        )

    def _start(self, document: dict[str, Any] | None, yaml_text: str | None) -> WorkflowContext:
        if not isinstance(document, dict):
            raise DocumentValidationError("Workflow document must be a JSON object.")

        raw_nodes = document.get("nodes")
        if not isinstance(raw_nodes, list):
            raise DocumentValidationError("Workflow document must include a `nodes` array.")

        rules = self._parse_rules(document.get("rules"))
        forms: list[LoginFormNode] = []
        apis: list[LoginApiNode] = []
        warnings: list[str] = []

        for entry in raw_nodes:
            if not isinstance(entry, dict):
                raise DocumentValidationError("Each workflow node must be a JSON object.")

            node_type = entry.get("type")
            if node_type == "LoginFormComponent":
                forms.append(self._parse_form_node(entry))
            elif node_type == "LoginAPIEndpoint":
                api_node = self._parse_api_node(entry)
                if not api_node.form_fields:
                    warnings.append(f"{api_node.id} has no form inputs connected.")
                apis.append(api_node)
            else:
                raise DocumentValidationError(f"Unsupported node type: {node_type!r}")

        if not forms:
            warnings.append("Workflow does not include a LoginFormComponent node.")
        if not apis:
            warnings.append("Workflow does not include a LoginAPIEndpoint node.")

        yaml_snapshot = yaml_text if isinstance(yaml_text, str) else None

        return WorkflowContext(
            yaml_text=yaml_snapshot,
            rules=rules,
            forms=forms,
            apis=apis,
            warnings=warnings,
        )

    def _generate_ui(self, context: WorkflowContext) -> None:
        if context.rules.frontend_framework not in SUPPORTED_FRONTEND_FRAMEWORKS:
            context.warnings.append(
                f"Frontend framework {context.rules.frontend_framework!r} is not supported. "
                "Generating React templates instead."
            )

        for form in context.forms:
            style_key = form.style_library.strip().lower()
            if style_key and style_key not in SUPPORTED_STYLE_LIBRARIES:
                context.warnings.append(
                    f"{form.id} uses unsupported style library {form.style_library!r}; generating standard HTML form."
                )

            descriptors = [
                {
                    "name": field.name,
                    "label": field.display_label,
                    "inputType": field.html_input_type,
                    "required": field.required,
                    "autoComplete": field.auto_complete,
                }
                for field in form.fields
            ]
            files = login_form.build_login_form_files(
                node_id=form.id,
                fields=descriptors,
                style_library=form.style_library,
                validation_mode=form.validation,
                language=context.rules.frontend_language,
            )
            for path, content in files:
                self._append_file(context, path, content)

    def _generate_api(self, context: WorkflowContext) -> None:
        if context.rules.backend_framework not in SUPPORTED_BACKEND_FRAMEWORKS:
            context.warnings.append(
                f"Backend framework {context.rules.backend_framework!r} is not supported. "
                "Generating Express templates instead."
            )

        for api_node in context.apis:
            files = login_api.build_login_api_files(
                node_id=api_node.id,
                method=api_node.method,
                path=api_node.path,
                auth_strategy=api_node.auth,
                fields=api_node.form_fields,
                source_ids=api_node.form_source_ids,
                language=context.rules.backend_language,
            )
            for path, content in files:
                self._append_file(context, path, content)

    def _synthesise(self, context: WorkflowContext) -> None:
        yaml_snapshot = _render_yaml_snapshot(context.yaml_text)
        if yaml_snapshot:
            self._append_file(context, "workflow/workflow.yaml", yaml_snapshot)

    def _stop(self, _: WorkflowContext) -> None:
        # Reserved for future cleanup logic.
        return

    def _append_file(self, context: WorkflowContext, path: str, content: str) -> None:
        context.files.append((path, content))

    def _parse_rules(self, candidate: Any) -> WorkflowRules:
        base = DEFAULT_RULES
        if isinstance(candidate, dict):
            base = _deep_merge_rules(DEFAULT_RULES, candidate)

        frontend = base.get("frontend") or {}
        backend = base.get("backend") or {}
        coding = base.get("coding") or {}

        frontend_language = str(frontend.get("language") or "TS").upper()
        if frontend_language not in SUPPORTED_LANGUAGES:
            raise UnsupportedConfigurationError(
                f"Frontend language {frontend_language!r} is not supported."
            )

        backend_language = str(backend.get("language") or "TS").upper()
        if backend_language not in SUPPORTED_LANGUAGES:
            raise UnsupportedConfigurationError(
                f"Backend language {backend_language!r} is not supported."
            )

        return WorkflowRules(
            frontend_framework=str(frontend.get("framework") or "React"),
            frontend_language=frontend_language,
            backend_framework=str(backend.get("framework") or "NodeExpress"),
            backend_language=backend_language,
            formatter=str(coding.get("formatter") or "prettier"),
            style=str(coding.get("style") or "airbnb"),
        )

    def _parse_form_node(self, payload: dict[str, Any]) -> LoginFormNode:
        node_id = _parse_node_id(payload)
        props = payload.get("props")
        if not isinstance(props, dict):
            raise DocumentValidationError(f"{node_id} props must be an object.")

        fields_raw = props.get("fields")
        if not isinstance(fields_raw, list) or not fields_raw:
            raise DocumentValidationError(f"{node_id} must define at least one form field.")

        fields = [self._parse_field(field, node_id) for field in fields_raw]

        ui = props.get("ui")
        if not isinstance(ui, dict):
            raise DocumentValidationError(f"{node_id} props.ui must be an object.")

        style_library = str(ui.get("styleLibrary") or "MaterialUI")
        validation = str(ui.get("validation") or "basic")

        position = _normalise_position(payload.get("position"))

        return LoginFormNode(
            id=node_id,
            fields=fields,
            style_library=style_library,
            validation=validation,
            position=position,
        )

    def _parse_api_node(self, payload: dict[str, Any]) -> LoginApiNode:
        node_id = _parse_node_id(payload)
        props = payload.get("props")
        if not isinstance(props, dict):
            raise DocumentValidationError(f"{node_id} props must be an object.")

        method_raw = str(props.get("method") or "POST")
        method = method_raw.upper()
        if method not in {"GET", "POST", "PUT", "DELETE", "PATCH"}:
            raise DocumentValidationError(f"{node_id} has unsupported HTTP method {method!r}.")

        path = str(props.get("path") or "/login")
        auth = str(props.get("auth") or "none")

        form_fields_raw = props.get("formFields")
        form_fields: list[LoginField] = []
        if isinstance(form_fields_raw, list):
            form_fields = [
                self._parse_field(field, node_id, allow_missing_required=True)
                for field in form_fields_raw
                if isinstance(field, dict)
            ]

        source_ids_raw = props.get("formSourceIds")
        source_ids: list[str] = []
        if isinstance(source_ids_raw, list):
            source_ids = [str(source) for source in source_ids_raw if str(source)]

        position = _normalise_position(payload.get("position"))

        return LoginApiNode(
            id=node_id,
            method=method,
            path=path,
            auth=auth,
            form_fields=form_fields,
            form_source_ids=source_ids,
            position=position,
        )

    def _parse_field(
        self, payload: dict[str, Any], node_id: str, *, allow_missing_required: bool = False
    ) -> LoginField:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise DocumentValidationError(f"{node_id} fields must include a non-empty name.")

        field_type = str(payload.get("type") or "string")
        if field_type not in {"string", "password", "email"}:
            raise DocumentValidationError(f"{node_id} field {name!r} has unsupported type {field_type!r}.")

        required_raw = payload.get("required")
        if isinstance(required_raw, bool):
            required = required_raw
        elif allow_missing_required:
            required = bool(required_raw)
        else:
            raise DocumentValidationError(
                f"{node_id} field {name!r} must include a boolean `required` flag."
            )

        return LoginField(name=name, field_type=field_type, required=required)


def _normalise_position(candidate: Any) -> dict[str, Any]:
    if isinstance(candidate, dict):
        x = candidate.get("x")
        y = candidate.get("y")
        if isinstance(x, (int, float)) and isinstance(y, (int, float)):
            return {"x": x, "y": y}
    return {"x": 0, "y": 0}


def _title_case(value: str) -> str:
    tokens = [token for token in _split_identifier(value) if token]
    if not tokens:
        return "Field"
    return " ".join(token.capitalize() for token in tokens)


def _normalise_input_type(field_type: str) -> str:
    if field_type == "password":
        return "password"
    if field_type == "email":
        return "email"
    return "text"


def _auto_complete_hint(field_type: str) -> str | None:
    if field_type == "password":
        return "current-password"
    if field_type == "email":
        return "email"
    return "username"


def _render_yaml_snapshot(yaml_text: str | None) -> str:
    if not yaml_text:
        return ""
    snapshot = yaml_text.strip()
    header = "# YAML snapshot generated by the Workflow Agent template-first engine\n"
    return header + snapshot + ("\n" if not snapshot.endswith("\n") else "")


def _split_identifier(value: str) -> list[str]:
    chunks: list[str] = []
    current = ""
    for char in value:
        if char.isalnum():
            current += char
            continue
        if current:
            chunks.append(current)
            current = ""
    if current:
        chunks.append(current)
    return chunks


def _parse_node_id(payload: dict[str, Any]) -> str:
    node_id = payload.get("id")
    if not isinstance(node_id, (str, int)):
        raise DocumentValidationError("Each node must include an `id` string.")
    return str(node_id)


def _deep_merge_rules(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = {}
    for key, value in base.items():
        merged[key] = value if not isinstance(value, dict) else _deep_merge_rules(value, {})
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_rules(merged[key], value)
        else:
            merged[key] = value
    return merged
