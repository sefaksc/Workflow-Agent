"""
Entry point for the Python workflow engine.

Sprint 4 introduces the JSON-lines protocol bridge used by the VS Code extension.
The implementation below keeps the behaviour deterministic while exercising the
handshake (READY, PING/PONG, RUN_WORKFLOW, CANCEL) and emitting stubbed outputs.
"""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import sys
import threading
import time
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

DEFAULT_RULES: Dict[str, Any] = {
    "frontend": {"framework": "React", "language": "TS"},
    "backend": {"framework": "NodeExpress", "language": "TS"},
    "coding": {"formatter": "prettier", "style": "airbnb"},
}


def _check_environment() -> dict[str, Any]:
    """Return diagnostic information about optional dependencies."""
    llama_index_spec = importlib.util.find_spec("llama_index")
    return {
        "status": "ok",
        "llamaIndexAvailable": llama_index_spec is not None,
    }


@dataclass
class RunContext:
    correlation_id: str
    cancel_event: threading.Event
    thread: threading.Thread


class Engine:
    """JSON-lines protocol workflow engine stub."""

    def __init__(self) -> None:
        self._writer_lock = threading.Lock()
        self._active_lock = threading.Lock()
        self._active_run: Optional[RunContext] = None

    def run(self) -> None:
        """Process incoming commands until stdin is closed."""
        self._emit({"type": "READY", "message": "Workflow engine stub ready"})
        for raw_line in sys.stdin:
            line = raw_line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                self._emit_error("Payload is not valid JSON.")
                continue
            if not isinstance(message, dict):
                self._emit_error("Payload must be a JSON object.")
                continue
            self._handle_message(message)

    def _handle_message(self, message: Dict[str, Any]) -> None:
        message_type = message.get("type")
        if message_type == "PING":
            self._emit({"type": "PONG"})
            return

        if message_type == "RUN_WORKFLOW":
            self._handle_run_workflow(message)
            return

        if message_type == "CANCEL":
            self._handle_cancel(message)
            return

        if message_type == "CHAT_REQUEST":
            self._handle_chat_request(message)
            return

        self._emit_error(f"Unsupported message type: {message_type}")

    def _handle_run_workflow(self, message: Dict[str, Any]) -> None:
        correlation_id = str(message.get("correlationId") or "").strip()
        if not correlation_id:
            self._emit_error("RUN_WORKFLOW message must include a correlationId.")
            return

        with self._active_lock:
            if self._active_run is not None:
                self._emit_error(
                    "A workflow is already in progress; concurrent runs are not yet supported.",
                    correlation_id=correlation_id,
                )
                return

            cancel_event = threading.Event()
            thread = threading.Thread(
                target=self._execute_run,
                args=(correlation_id, message, cancel_event),
                name=f"workflow-run-{correlation_id}",
                daemon=True,
            )
            self._active_run = RunContext(
                correlation_id=correlation_id,
                cancel_event=cancel_event,
                thread=thread,
            )
            thread.start()

    def _handle_cancel(self, message: Dict[str, Any]) -> None:
        correlation_id = str(message.get("correlationId") or "").strip()
        if not correlation_id:
            self._emit_log("Received CANCEL without correlationId.", level="warn")
            return

        with self._active_lock:
            context = self._active_run

        if context is None or context.correlation_id != correlation_id:
            self._emit_log(f"No active workflow run matches {correlation_id}; ignoring cancel.", level="warn")
            return

        self._emit_log(f"Cancellation requested for {correlation_id}.", correlation_id=correlation_id)
        context.cancel_event.set()

    def _handle_chat_request(self, message: Dict[str, Any]) -> None:
        correlation_id = str(message.get("correlationId") or "").strip()
        if not correlation_id:
            self._emit_error("CHAT_REQUEST message must include a correlationId.")
            return

        prompt = str(message.get("prompt") or "").strip()
        if not prompt:
            self._emit_error("CHAT_REQUEST requires a prompt.", correlation_id=correlation_id)
            return

        workflow_payload = message.get("workflow")
        document = workflow_payload.get("document") if isinstance(workflow_payload, dict) else None
        document = document if isinstance(document, dict) else {}

        nodes_payload = document.get("nodes")
        nodes: List[Dict[str, Any]] = (
            [node for node in nodes_payload if isinstance(node, dict)] if isinstance(nodes_payload, list) else []
        )

        rules_payload = document.get("rules") if isinstance(document.get("rules"), dict) else None
        rules = self._clone_rules(rules_payload)
        original_rules = self._clone_rules(rules_payload)

        prompt_lower = prompt.lower()
        plain_prompt = self._normalise_prompt(prompt_lower)

        def contains(*tokens: str) -> bool:
            return any(token in prompt_lower or token in plain_prompt for token in tokens)

        actions: List[Dict[str, Any]] = []
        replies: List[str] = []
        follow_ups: List[str] = []
        last_form_id: str | None = None
        last_api_id: str | None = None

        if contains("new workflow", "reset workflow", "workflow'u sifirla", "workflowu sifirla", "yeni akis"):
            actions.append({"type": "new_workflow"})
            replies.append("Workflow'u sifirliyorum.")
            nodes = []

        wants_form = contains("login") and contains("form")
        wants_api = contains("login") and contains("api", "endpoint")
        mentions_add = contains("add", "create", "olustur", "ekle")

        if wants_form and mentions_add:
            node_id = self._suggest_node_id("LoginFormComponent", nodes)
            actions.append({"type": "add_node", "nodeType": "LoginFormComponent", "nodeId": node_id})
            replies.append(f"{node_id} form dugumunu ekliyorum.")
            nodes.append({"id": node_id, "type": "LoginFormComponent"})
            last_form_id = node_id

        if wants_api and mentions_add:
            node_id = self._suggest_node_id("LoginAPIEndpoint", nodes)
            actions.append({"type": "add_node", "nodeType": "LoginAPIEndpoint", "nodeId": node_id})
            replies.append(f"{node_id} API dugumunu ekliyorum.")
            nodes.append({"id": node_id, "type": "LoginAPIEndpoint"})
            last_api_id = node_id

        wants_connection = contains("connect", "bagla", "baglanti kur")
        if wants_connection and contains("form", "formu") and contains("api", "endpoint"):
            source_id = last_form_id or self._first_node_id("LoginFormComponent", nodes)
            target_id = last_api_id or self._first_node_id("LoginAPIEndpoint", nodes)
            if source_id and target_id:
                actions.append({"type": "connect", "from": source_id, "to": target_id})
                replies.append(f"{source_id} dugumunu {target_id} dugumune bagliyorum.")
            else:
                follow_ups.append("Baglamak icin form ve API dugumleri gerekli.")

        rules_changed = False
        updated_rules = None
        if contains("javascript", " js"):
            updated_rules = self._clone_rules(rules)
            updated_rules["frontend"]["language"] = "JS"
            updated_rules["backend"]["language"] = "JS"
        elif contains("typescript", " ts"):
            updated_rules = self._clone_rules(rules)
            updated_rules["frontend"]["language"] = "TS"
            updated_rules["backend"]["language"] = "TS"

        if contains("material", "mui"):
            updated_rules = updated_rules or self._clone_rules(rules)
            updated_rules["frontend"]["framework"] = "MaterialUI"

        if contains("react"):
            updated_rules = updated_rules or self._clone_rules(rules)
            updated_rules["frontend"]["framework"] = "React"

        if contains("express", "node express", "nodeexpress"):
            updated_rules = updated_rules or self._clone_rules(rules)
            updated_rules["backend"]["framework"] = "NodeExpress"

        if updated_rules is not None and updated_rules != rules:
            actions.append({"type": "set_rules", "rules": updated_rules})
            replies.append("Kurallari guncelliyorum.")
            rules = updated_rules
            rules_changed = True

        if contains("run", "calistir", "generate", "uret"):
            actions.append({"type": "run_workflow"})
            replies.append("Workflow'u calistiriyorum.")

        if not replies:
            if updated_rules is not None and not rules_changed and updated_rules == original_rules:
                replies.append("Kurallar zaten istediginiz sekilde ayarli.")
            else:
                replies.append("Nasil yardimci olabilecegimi anlamadim. Ornek: \"Login form ekle ve API'ye bagla\" veya `/run`.")

        payload: Dict[str, Any] = {
            "type": "CHAT_RESPONSE",
            "correlationId": correlation_id,
            "reply": replies,
            "actions": actions,
        }
        if follow_ups:
            payload["followUps"] = follow_ups

        self._emit(payload)

    def _execute_run(
        self,
        correlation_id: str,
        message: Dict[str, Any],
        cancel_event: threading.Event,
    ) -> None:
        try:
            document = message.get("document")
            yaml_text = message.get("yaml")

            nodes = []
            if isinstance(document, dict):
                raw_nodes = document.get("nodes")
                if isinstance(raw_nodes, list):
                    nodes = raw_nodes

            self._emit_log(
                f"Received workflow with {len(nodes)} node(s).",
                correlation_id=correlation_id,
            )

            steps: Iterable[tuple[str, int]] = [
                ("Pre-processing workflow graph", 10),
                ("Compiling generation templates", 55),
                ("Assembling output artifacts", 85),
            ]

            for step, pct in steps:
                if cancel_event.is_set():
                    self._emit_complete(correlation_id, [], cancelled=True)
                    return
                self._emit_progress(correlation_id, step, pct)
                time.sleep(0.05)

            files = self._synthesise_files(document, yaml_text)
            warnings = self._produce_warnings(document)

            if cancel_event.is_set():
                self._emit_complete(correlation_id, [], cancelled=True)
                return

            self._emit_progress(correlation_id, "Finalising results", 100)
            self._emit_complete(correlation_id, files, warnings=warnings or None)
        except Exception as error:  # pragma: no cover - defensive guard
            self._emit_error(f"Workflow run failed: {error}", correlation_id=correlation_id)
        finally:
            with self._active_lock:
                self._active_run = None

    def _synthesise_files(
        self,
        document: Optional[Dict[str, Any]],
        yaml_text: Optional[str],
    ) -> List[Dict[str, str]]:
        files: List[Dict[str, str]] = []
        nodes = []
        if isinstance(document, dict):
            raw_nodes = document.get("nodes")
            if isinstance(raw_nodes, list):
                nodes = raw_nodes

        for node in nodes:
            if not isinstance(node, dict):
                continue
            node_id = str(node.get("id") or "Node")
            node_type = node.get("type")
            props = node.get("props") if isinstance(node.get("props"), dict) else {}

            if node_type == "LoginFormComponent":
                files.append(
                    {
                        "path": f"frontend/{node_id}.tsx",
                        "content": self._render_form_stub(node_id, props),
                    }
                )
            elif node_type == "LoginAPIEndpoint":
                files.append(
                    {
                        "path": f"backend/{node_id}.ts",
                        "content": self._render_api_stub(node_id, props),
                    }
                )

        yaml_snapshot = self._render_yaml_snapshot(yaml_text)
        if yaml_snapshot:
            files.append({"path": "workflow/workflow.yaml", "content": yaml_snapshot})

        return files

    def _render_form_stub(self, node_id: str, props: Dict[str, Any]) -> str:
        fields_raw = props.get("fields") if isinstance(props, dict) else None
        fields: List[Dict[str, Any]] = []
        if isinstance(fields_raw, list):
            fields = [field for field in fields_raw if isinstance(field, dict)]

        lines = [
            f"// Auto-generated stub for {node_id}",
            "// This file is produced by the Workflow Agent sprint 4 engine stub.",
            "",
            "export interface FieldDescriptor {",
            '  name: string;',
            '  type: "string" | "password" | "email";',
            "  required: boolean;",
            "}",
            "",
            f"export const {node_id}Fields: FieldDescriptor[] = [",
        ]

        for field in fields:
            name = str(field.get("name") or "field")
            field_type = str(field.get("type") or "string")
            required = self._js_bool(bool(field.get("required")))
            lines.append(
                f'  {{ name: "{name}", type: "{field_type}", required: {required} }},'
            )

        lines.extend(
            [
                "];",
                "",
                "export function renderForm(): FieldDescriptor[] {",
                "  return [..." + node_id + "Fields];",
                "}",
            ]
        )

        return "\n".join(lines)

    def _render_api_stub(self, node_id: str, props: Dict[str, Any]) -> str:
        method = str(props.get("method") or "POST")
        path = str(props.get("path") or "/")
        auth = str(props.get("auth") or "none")
        form_fields_raw = props.get("formFields")
        form_source_ids_raw = props.get("formSourceIds")

        form_fields: List[Dict[str, Any]] = []
        if isinstance(form_fields_raw, list):
            form_fields = [field for field in form_fields_raw if isinstance(field, dict)]

        form_sources: List[str] = []
        if isinstance(form_source_ids_raw, list):
            form_sources = [str(source) for source in form_source_ids_raw]

        lines = [
            f"// Auto-generated stub for {node_id}",
            "// Derived from the workflow graph; replace with real implementation.",
            f"// Endpoint: {method} {path}",
            f"// Authentication: {auth}",
            "",
            "interface RequestField {",
            "  name: string;",
            "  type: string;",
            "  required: boolean;",
            "}",
            "",
            "interface GeneratedRequestSchema {",
            "  fields: RequestField[];",
            "  sourceForms: string[];",
            "}",
            "",
            "export const requestSchema: GeneratedRequestSchema = {",
            "  fields: [",
        ]

        for field in form_fields:
            name = str(field.get("name") or "field")
            field_type = str(field.get("type") or "string")
            required = self._js_bool(bool(field.get("required")))
            lines.append(
                f'    {{ name: "{name}", type: "{field_type}", required: {required} }},'
            )

        lines.append("  ],")

        source_list = ", ".join(f'"{source}"' for source in form_sources)
        lines.extend(
            [
                f"  sourceForms: [{source_list}],",
                "};",
                "",
                f"export function register{node_id}Route(app: unknown): void {{",
                f'  console.log("Registering {node_id} with", requestSchema);',
                "  void app;",
                "}",
            ]
        )

        return "\n".join(lines)

    def _render_yaml_snapshot(self, yaml_text: Optional[str]) -> str:
        if not yaml_text or not isinstance(yaml_text, str):
            return ""
        header = "# YAML snapshot generated by Workflow Agent sprint 4 engine stub\n"
        return header + yaml_text.strip() + ("\n" if not yaml_text.endswith("\n") else "")

    def _produce_warnings(self, document: Optional[Dict[str, Any]]) -> List[str]:
        warnings: List[str] = []
        if not isinstance(document, dict):
            return warnings
        nodes = document.get("nodes")
        if not isinstance(nodes, list):
            return warnings

        for node in nodes:
            if not isinstance(node, dict):
                continue
            if node.get("type") != "LoginAPIEndpoint":
                continue
            props = node.get("props")
            form_fields = []
            if isinstance(props, dict):
                raw_form_fields = props.get("formFields")
                if isinstance(raw_form_fields, list):
                    form_fields = [field for field in raw_form_fields if isinstance(field, dict)]
            if not form_fields:
                warnings.append(f"{node.get('id', 'API')} has no form inputs connected.")
        return warnings

    @staticmethod
    def _clone_rules(rules: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        base = rules if isinstance(rules, dict) else DEFAULT_RULES
        return copy.deepcopy(base)

    @staticmethod
    def _suggest_node_id(node_type: str, nodes: List[Dict[str, Any]]) -> str:
        prefix = "LoginForm" if node_type == "LoginFormComponent" else "LoginAPI"
        existing_ids = {
            str(node.get("id"))
            for node in nodes
            if isinstance(node, dict) and isinstance(node.get("id"), (str, int))
        }
        index = 1
        while True:
            candidate = f"{prefix}{index}"
            if candidate not in existing_ids:
                return candidate
            index += 1

    @staticmethod
    def _first_node_id(node_type: str, nodes: List[Dict[str, Any]]) -> Optional[str]:
        for node in nodes:
            if not isinstance(node, dict):
                continue
            if node.get("type") != node_type:
                continue
            node_id = node.get("id")
            if isinstance(node_id, (str, int)):
                return str(node_id)
        return None

    @staticmethod
    def _normalise_prompt(text: str) -> str:
        normalised = unicodedata.normalize("NFKD", text)
        return normalised.encode("ascii", "ignore").decode("ascii")

    def _emit(self, payload: Dict[str, Any]) -> None:
        with self._writer_lock:
            sys.stdout.write(json.dumps(payload))
            sys.stdout.write("\n")
            sys.stdout.flush()

    def _emit_progress(self, correlation_id: str, step: str, pct: int) -> None:
        self._emit(
            {
                "type": "PROGRESS",
                "correlationId": correlation_id,
                "step": step,
                "pct": pct,
            }
        )

    def _emit_complete(
        self,
        correlation_id: str,
        files: List[Dict[str, str]],
        warnings: Optional[List[str]] = None,
        cancelled: bool = False,
    ) -> None:
        payload: Dict[str, Any] = {
            "type": "COMPLETE",
            "correlationId": correlation_id,
            "files": files,
        }
        if warnings:
            payload["warnings"] = warnings
        if cancelled:
            payload["cancelled"] = True
        self._emit(payload)

    def _emit_log(
        self,
        message: str,
        *,
        level: str = "info",
        correlation_id: Optional[str] = None,
    ) -> None:
        payload: Dict[str, Any] = {
            "type": "LOG",
            "level": level,
            "message": message,
        }
        if correlation_id:
            payload["correlationId"] = correlation_id
        self._emit(payload)

    def _emit_error(self, message: str, correlation_id: Optional[str] = None) -> None:
        payload: Dict[str, Any] = {
            "type": "ERROR",
            "message": message,
        }
        if correlation_id:
            payload["correlationId"] = correlation_id
        self._emit(payload)

    @staticmethod
    def _js_bool(value: bool) -> str:
        return "true" if value else "false"


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Workflow Agent engine stub")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run environment diagnostics and exit.",
    )
    args = parser.parse_args(argv)

    if args.check:
        diagnostics = _check_environment()
        print(json.dumps(diagnostics))
        return 0

    Engine().run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
